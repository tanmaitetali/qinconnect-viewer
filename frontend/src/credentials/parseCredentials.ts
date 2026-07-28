// Parses AWS credentials pasted in whatever format the user has handy, so
// they don't have to copy access key / secret key / session token into three
// separate fields by hand. Mirrors the parser used in the ivr-tester project.
export interface ParsedCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region?: string;
  expiration?: string;
}

export type CredentialFormat = 'json' | 'ini' | 'env';

export type ParseResult =
  | { ok: true; creds: ParsedCredentials; format: CredentialFormat }
  | { ok: false; error: string };

function stripQuotes(v: string): string {
  const t = v.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * Parses AWS credentials pasted in any of these forms:
 *  - export lines:  export AWS_ACCESS_KEY_ID=... (with/without `export`, quotes)
 *  - AWS CLI shared profile / saml2aws INI: [profile]\naws_access_key_id = ...
 *  - JSON: aws sts output ({ "Credentials": { ... } }) or a flat object
 *
 * Returns a normalized credential object. Nothing here leaves the browser.
 */
export function parseCredentials(input: string): ParseResult {
  const text = input.trim();
  if (!text) return { ok: false, error: 'Paste some credentials first.' };

  // ---- JSON ----------------------------------------------------------------
  if (text.startsWith('{')) {
    try {
      const obj = JSON.parse(text) as Record<string, unknown>;
      const c = (obj.Credentials ?? obj.credentials ?? obj) as Record<string, unknown>;
      const creds: ParsedCredentials = {
        accessKeyId: String(c.AccessKeyId ?? c.accessKeyId ?? ''),
        secretAccessKey: String(c.SecretAccessKey ?? c.secretAccessKey ?? ''),
        sessionToken:
          (c.SessionToken as string) ?? (c.sessionToken as string) ?? undefined,
        region: (obj.region as string) ?? (obj.Region as string) ?? undefined,
        expiration:
          (c.Expiration as string) ?? (c.expiration as string) ?? undefined,
      };
      return finalize(creds, 'json');
    } catch {
      return { ok: false, error: 'Looks like JSON but could not be parsed.' };
    }
  }

  // ---- Line-based (export / INI / env) -------------------------------------
  const map: Record<string, string> = {};
  let sawIniSection = false;
  let sawExport = false;

  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      sawIniSection = true;
      continue;
    }
    if (line.toLowerCase().startsWith('export ')) {
      line = line.slice(7).trim();
      sawExport = true;
    }
    const eq = line.indexOf('=');
    const colon = line.indexOf(':');
    const sep =
      eq === -1 ? colon : colon === -1 ? eq : Math.min(eq, colon);
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim().toLowerCase();
    const value = stripQuotes(line.slice(sep + 1));
    if (key) map[key] = value;
  }

  const pick = (...keys: string[]) => {
    for (const k of keys) {
      if (map[k]) return map[k];
    }
    return undefined;
  };

  const creds: ParsedCredentials = {
    accessKeyId: pick('aws_access_key_id', 'access_key_id') ?? '',
    secretAccessKey: pick('aws_secret_access_key', 'secret_access_key') ?? '',
    sessionToken: pick('aws_session_token', 'aws_security_token', 'session_token'),
    region: pick('region', 'aws_region', 'aws_default_region', 'default_region'),
    expiration: pick('x_security_token_expires', 'expiration', 'expires'),
  };

  const format: CredentialFormat = sawIniSection && !sawExport ? 'ini' : 'env';
  return finalize(creds, format);
}

function finalize(creds: ParsedCredentials, format: CredentialFormat): ParseResult {
  if (!creds.accessKeyId || !creds.secretAccessKey) {
    return {
      ok: false,
      error: 'Could not find an access key id and secret access key.',
    };
  }
  // Drop empty optionals.
  const clean: ParsedCredentials = {
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
  };
  if (creds.sessionToken) clean.sessionToken = creds.sessionToken;
  if (creds.region) clean.region = creds.region;
  if (creds.expiration) clean.expiration = creds.expiration;
  return { ok: true, creds: clean, format };
}

/** Masks a secret/token for display (keeps last 4 chars). */
export function maskSecret(value?: string): string {
  if (!value) return '';
  if (value.length <= 4) return '••••';
  return `••••${value.slice(-4)}`;
}
