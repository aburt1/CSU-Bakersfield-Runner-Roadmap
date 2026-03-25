import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const TENANT_ID = () => process.env.AZURE_AD_TENANT_ID;
const CLIENT_ID = () => process.env.AZURE_AD_CLIENT_ID;
const JWKS_REFRESH_MS = 24 * 60 * 60 * 1000; // 24 hours

let cachedKeys = null;
let lastFetchTime = 0;

async function fetchJwks() {
  const tenantId = TENANT_ID();
  const url = `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch JWKS: ${res.status}`);
  }
  const data = await res.json();
  cachedKeys = data.keys;
  lastFetchTime = Date.now();
  return cachedKeys;
}

async function getSigningKey(kid) {
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

function jwkToPem(jwk) {
  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  return publicKey.export({ type: 'spki', format: 'pem' });
}

export async function verifyAzureAdToken(idToken) {
  // Decode header to get kid
  const header = JSON.parse(
    Buffer.from(idToken.split('.')[0], 'base64url').toString()
  );

  const jwk = await getSigningKey(header.kid);
  const pem = jwkToPem(jwk);

  const tenantId = TENANT_ID();
  const clientId = CLIENT_ID();

  const decoded = jwt.verify(idToken, pem, {
    algorithms: ['RS256'],
    audience: clientId,
    issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
  });

  return {
    oid: decoded.oid,
    email: decoded.preferred_username || decoded.email,
    name: decoded.name,
  };
}
