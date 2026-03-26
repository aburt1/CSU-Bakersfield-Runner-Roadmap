import jwt from 'jsonwebtoken';
import crypto from 'crypto';

interface JwkKey {
  kid: string;
  kty: string;
  use?: string;
  n?: string;
  e?: string;
  [key: string]: unknown;
}

interface AzureAdClaims {
  oid: string;
  preferred_username?: string;
  email?: string;
  name?: string;
}

const TENANT_ID = (): string | undefined => process.env.AZURE_AD_TENANT_ID;
const CLIENT_ID = (): string | undefined => process.env.AZURE_AD_CLIENT_ID;
const JWKS_REFRESH_MS = 24 * 60 * 60 * 1000; // 24 hours

let cachedKeys: JwkKey[] | null = null;
let lastFetchTime = 0;

async function fetchJwks(): Promise<JwkKey[]> {
  const tenantId = TENANT_ID();
  const url = `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch JWKS: ${res.status}`);
  }
  const data = (await res.json()) as { keys: JwkKey[] };
  cachedKeys = data.keys;
  lastFetchTime = Date.now();
  return cachedKeys;
}

async function getSigningKey(kid: string): Promise<JwkKey> {
  // Use cache if fresh
  if (cachedKeys && (Date.now() - lastFetchTime) < JWKS_REFRESH_MS) {
    const key = cachedKeys.find((k) => k.kid === kid);
    if (key) return key;
  }

  // Cache miss or stale — re-fetch (handles key rotation)
  const keys = await fetchJwks();
  const key = keys.find((k) => k.kid === kid);
  if (!key) {
    throw new Error(`Signing key not found for kid: ${kid}`);
  }
  return key;
}

function jwkToPem(jwk: JwkKey): string | Buffer {
  const publicKey = crypto.createPublicKey({ key: jwk as JsonWebKey, format: 'jwk' });
  return publicKey.export({ type: 'spki', format: 'pem' });
}

export async function verifyAzureAdToken(idToken: string): Promise<{ oid: string; email: string | undefined; name: string | undefined }> {
  // Decode header to get kid
  const header = JSON.parse(
    Buffer.from(idToken.split('.')[0], 'base64url').toString()
  ) as { kid: string };

  const jwk = await getSigningKey(header.kid);
  const pem = jwkToPem(jwk);

  const tenantId = TENANT_ID();
  const clientId = CLIENT_ID();

  const decoded = jwt.verify(idToken, pem, {
    algorithms: ['RS256'],
    audience: clientId,
    issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
  }) as AzureAdClaims;

  return {
    oid: decoded.oid,
    email: decoded.preferred_username || decoded.email,
    name: decoded.name,
  };
}
