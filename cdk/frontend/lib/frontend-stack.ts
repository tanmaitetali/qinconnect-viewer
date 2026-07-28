import { Stack, StackProps, CfnOutput, RemovalPolicy, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as fs from 'fs';
import * as path from 'path';
import { EnvConfig } from './config';

export interface FrontendStackProps extends StackProps {
  config: EnvConfig;
}

/**
 * Hosts the built SPA in a private S3 bucket fronted by CloudFront (OAC).
 * Also writes a runtime config.json into the bucket so the same build
 * artifact can be promoted across environments.
 *
 * This app has no backend of its own — all CloudWatch/Bedrock calls run
 * directly from the browser using credentials the user enters in Settings.
 * Auth is against the SAME Cognito user pool as ivr-tester, through this
 * app's own app client — deploy ivr-tester's auth stack first and copy its
 * `qinconnectClientId` output into config/<env>.json before deploying this.
 */
export class FrontendStack extends Stack {
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);
    const { config } = props;

    const missing: string[] = [];
    if (!config.auth.userPoolId) missing.push('auth.userPoolId');
    if (!config.auth.userPoolClientId) missing.push('auth.userPoolClientId');
    if (missing.length) {
      throw new Error(
        `config/${config.env}.json is missing ${missing.join(', ')}. ` +
          `Deploy ivr-tester's auth stack first (it creates this app's Cognito app ` +
          `client) and copy the qinconnectClientId output in.`,
      );
    }

    const bucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: config.env === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: config.env !== 'prod',
    });

    // Optional custom domain. CloudFront reads certificates only from us-east-1,
    // which is where this stack is deployed, so the cert can live in-stack.
    const domain = config.domain;
    let hostedZone: route53.IHostedZone | undefined;
    let certificate: acm.ICertificate | undefined;

    if (domain?.name) {
      if (domain.hostedZoneId && domain.hostedZoneName) {
        hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
          hostedZoneId: domain.hostedZoneId,
          zoneName: domain.hostedZoneName,
        });
      }

      if (domain.certificateArn) {
        // Reuse an existing cert (e.g. ivr-tester's *.t12apps.com wildcard). Must be in us-east-1.
        certificate = acm.Certificate.fromCertificateArn(this, 'SiteCertificate', domain.certificateArn);
      } else if (hostedZone) {
        // No ARN provided: request a DNS-validated cert for the domain.
        certificate = new acm.Certificate(this, 'SiteCertificate', {
          domainName: domain.name,
          validation: acm.CertificateValidation.fromDns(hostedZone),
        });
      } else {
        throw new Error(
          `config/${config.env}.json domain requires either a certificateArn or ` +
            `hostedZoneId + hostedZoneName so a certificate can be resolved.`,
        );
      }
    }

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      ...(domain?.name && certificate ? { domainNames: [domain.name], certificate } : {}),
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      // SPA: route client-side paths back to index.html.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: Duration.minutes(5) },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: Duration.minutes(5) },
      ],
    });

    // The browser-facing runtime config, assembled from config/<env>.json.
    const publicConfig = {
      env: config.env,
      appName: config.appName,
      auth: config.auth,
    };

    // Deploy the built site if it exists, otherwise a placeholder so the stack
    // still synthesizes before the first frontend build.
    const distPath = path.resolve(__dirname, '..', '..', '..', 'frontend', 'dist');
    const siteSource = fs.existsSync(path.join(distPath, 'index.html'))
      ? s3deploy.Source.asset(distPath)
      : s3deploy.Source.data(
          'index.html',
          '<!doctype html><title>qinconnect-log-viewer</title><h1>Build the frontend: npm --workspace frontend run build</h1>',
        );

    new s3deploy.BucketDeployment(this, 'DeploySite', {
      destinationBucket: bucket,
      sources: [siteSource, s3deploy.Source.jsonData('config.json', publicConfig)],
      distribution: this.distribution,
      distributionPaths: ['/*'],
    });

    // Point the custom domain at the distribution (A + AAAA aliases).
    if (domain?.name && hostedZone) {
      const target = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution));
      new route53.ARecord(this, 'AliasRecord', { zone: hostedZone, recordName: domain.name, target });
      new route53.AaaaRecord(this, 'AliasRecordAAAA', { zone: hostedZone, recordName: domain.name, target });
    }

    new CfnOutput(this, 'DistributionDomainName', { value: this.distribution.distributionDomainName });
    new CfnOutput(this, 'SiteUrl', {
      value: domain?.name ? `https://${domain.name}` : `https://${this.distribution.distributionDomainName}`,
    });
    if (domain?.name) {
      new CfnOutput(this, 'CloudFrontUrl', {
        value: `https://${this.distribution.distributionDomainName}`,
        description: 'The raw CloudFront URL (still valid alongside the custom domain).',
      });
    }
  }
}
