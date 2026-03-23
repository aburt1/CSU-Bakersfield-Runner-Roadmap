import dns from 'dns/promises';
import { decrypt, isEncryptionConfigured } from './encryption.js';
import { applyStudentProgressChange } from './progress.js';

// In-memory run state — keyed by student email
const runStates = new Map();

export function getRunState(email) {
  return runStates.get(email) || { status: 'no_run', checkedSteps: [] };
}

export function setRunState(email, state) {
  runStates.set(email, state);
  // Clean up after 2 minutes for completed runs, 5 minutes for running (safety net)
  const ttl = state.status === 'complete' ? 120_000 : 300_000;
  setTimeout(() => runStates.delete(email), ttl);
}

/**
 * Traverse an object by dot-notation path.
 * Returns undefined if any intermediate is null/undefined.
 */
export function extractFieldValue(obj, dotPath) {
  if (!obj || !dotPath) return undefined;
  const parts = dotPath.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

function isPrivateIPv4(ip) {
  if (ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('0.') || ip.startsWith('169.254.')) return true;
  if (ip.startsWith('172.')) {
    const second = parseInt(ip.split('.')[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  if (ip.startsWith('192.168.')) return true;
  return false;
}

function isPrivateIPv6(ip) {
  const normalized = ip.toLowerCase();
  return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd');
}

/**
 * Validate a URL for SSRF protection.
 * Rejects private IPs, localhost, and non-HTTP(S) schemes.
 * Note: DNS rebinding (TOCTOU between resolve and fetch) is a known v1 limitation.
 * For v2, consider using a custom dns.lookup via http.Agent to pin the resolved IP.
 */
export async function validateUrl(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    return { valid: false, reason: 'Invalid URL format' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, reason: `Scheme "${parsed.protocol}" not allowed — only http: and https:` };
  }

  const hostname = parsed.hostname;
  const isDev = process.env.NODE_ENV !== 'production';

  if (hostname === 'localhost' || hostname === '[::1]') {
    if (!isDev) {
      return { valid: false, reason: 'Requests to localhost are not allowed' };
    }
    // Allow localhost in development for mock/test APIs
    return { valid: true };
  }

  try {
    const { address, family } = await dns.lookup(hostname);
    if (family === 4 && isPrivateIPv4(address)) {
      if (!isDev) {
        return { valid: false, reason: `Resolved to private IP ${address}` };
      }
      return { valid: true };
    }
    if (family === 6 && isPrivateIPv6(address)) {
      if (!isDev) {
        return { valid: false, reason: `Resolved to private IPv6 ${address}` };
      }
      return { valid: true };
    }
  } catch {
    return { valid: false, reason: `DNS resolution failed for ${hostname}` };
  }

  return { valid: true };
}

/**
 * Build authentication headers based on auth config.
 */
function buildAuthHeaders(authType, credentials) {
  if (authType === 'basic' && credentials) {
    const { username, password } = JSON.parse(credentials);
    const encoded = Buffer.from(`${username}:${password}`).toString('base64');
    return { Authorization: `Basic ${encoded}` };
  }
  if (authType === 'bearer' && credentials) {
    const { token } = JSON.parse(credentials);
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

/**
 * Execute a single API check and return the result (no DB writes).
 */
export async function testApiCheck(db, checkConfig, testStudentId) {
  const placeholder = checkConfig.student_param_name || 'studentId';
  const placeholderRegex = new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g');
  const url = checkConfig.url.replace(placeholderRegex, encodeURIComponent(testStudentId));

  const urlCheck = await validateUrl(url);
  if (!urlCheck.valid) {
    return { error: `URL rejected: ${urlCheck.reason}` };
  }

  let credentials = null;
  if (checkConfig.auth_type !== 'none' && checkConfig.auth_credentials) {
    try {
      credentials = decrypt(checkConfig.auth_credentials);
    } catch {
      return { error: 'Failed to decrypt credentials' };
    }
  }

  const headers = {
    Accept: 'application/json',
    ...buildAuthHeaders(checkConfig.auth_type, credentials),
  };

  if (checkConfig.headers) {
    try {
      const custom = JSON.parse(checkConfig.headers);
      for (const { key, value } of custom) {
        if (key) headers[key] = value;
      }
    } catch { /* ignore malformed headers */ }
  }

  try {
    const response = await fetch(url, {
      method: checkConfig.http_method || 'GET',
      headers,
      signal: AbortSignal.timeout(5000),
    });

    const responseBody = await response.text();
    let parsed;
    let extractedValue;
    try {
      parsed = JSON.parse(responseBody);
      extractedValue = extractFieldValue(parsed, checkConfig.response_field_path);
    } catch {
      extractedValue = undefined;
    }

    return {
      statusCode: response.status,
      responseBody: responseBody.length > 2048 ? responseBody.slice(0, 2048) + '...' : responseBody,
      extractedValue: extractedValue ?? null,
      wouldMarkComplete: Boolean(extractedValue),
    };
  } catch (err) {
    return { error: `Request failed: ${err.message}` };
  }
}

/**
 * Run all enabled API checks for a student.
 * Executes sequentially in step sort_order, with a 15s total cap.
 */
export async function runApiChecksForStudent(db, student) {
  const checks = await db.queryAll(
    `SELECT sac.*, s.id AS s_id, s.sort_order
     FROM step_api_checks sac
     JOIN steps s ON s.id = sac.step_id
     WHERE sac.is_enabled = true
       AND s.term_id = $1
       AND s.is_active = 1
     ORDER BY s.sort_order`,
    [student.term_id]
  );

  const checkedSteps = [];
  const startedAt = Date.now();

  for (const check of checks) {
    // 15-second total cap
    if (Date.now() - startedAt > 15_000) {
      console.warn('[api-check-runner] 15s total cap reached, stopping early');
      break;
    }

    try {
      const studentIdentifier = check.student_param_source === 'email'
        ? student.email
        : student.emplid;

      if (!studentIdentifier) {
        console.warn(`[api-check-runner] No ${check.student_param_source} for student ${student.id}, skipping step ${check.step_id}`);
        continue;
      }

      const placeholder = check.student_param_name || 'studentId';
      const placeholderRegex = new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g');
      const url = check.url.replace(placeholderRegex, encodeURIComponent(studentIdentifier));

      const urlCheck = await validateUrl(url);
      if (!urlCheck.valid) {
        console.warn(`[api-check-runner] URL rejected for step ${check.step_id}: ${urlCheck.reason}`);
        continue;
      }

      let credentials = null;
      if (check.auth_type !== 'none' && check.auth_credentials) {
        if (!isEncryptionConfigured()) {
          console.warn(`[api-check-runner] Encryption not configured, skipping step ${check.step_id}`);
          continue;
        }
        try {
          credentials = decrypt(check.auth_credentials);
        } catch (err) {
          console.warn(`[api-check-runner] Failed to decrypt creds for step ${check.step_id}: ${err.message}`);
          continue;
        }
      }

      const headers = {
        Accept: 'application/json',
        ...buildAuthHeaders(check.auth_type, credentials),
      };

      if (check.headers) {
        try {
          const custom = JSON.parse(check.headers);
          for (const { key, value } of custom) {
            if (key) headers[key] = value;
          }
        } catch { /* ignore */ }
      }

      const response = await fetch(url, {
        method: check.http_method || 'GET',
        headers,
        signal: AbortSignal.timeout(5000),
      });

      let extractedValue;
      try {
        const body = await response.json();
        extractedValue = extractFieldValue(body, check.response_field_path);
      } catch {
        extractedValue = undefined;
      }

      const isTruthy = Boolean(extractedValue);

      if (isTruthy) {
        // Check if step is already completed
        const existing = await db.queryOne(
          'SELECT status FROM student_progress WHERE student_id = $1 AND step_id = $2',
          [student.id, check.step_id]
        );

        if (!existing || existing.status === 'not_completed') {
          await applyStudentProgressChange(db, {
            studentId: student.id,
            stepId: check.step_id,
            status: 'completed',
            completedBy: 'api_check',
          });
          checkedSteps.push({ stepId: check.step_id, newStatus: 'completed' });
        }
      } else {
        // Only revert if completed_by is 'api_check'
        const existing = await db.queryOne(
          'SELECT status, completed_by FROM student_progress WHERE student_id = $1 AND step_id = $2',
          [student.id, check.step_id]
        );

        if (existing && existing.status === 'completed' && existing.completed_by === 'api_check') {
          await applyStudentProgressChange(db, {
            studentId: student.id,
            stepId: check.step_id,
            status: 'not_completed',
            completedBy: 'api_check',
          });
          checkedSteps.push({ stepId: check.step_id, newStatus: 'not_completed' });
        }
      }
    } catch (err) {
      console.warn(`[api-check-runner] Error checking step ${check.step_id}: ${err.message}`);
    }
  }

  // Update throttle timestamp
  await db.execute(
    'UPDATE students SET last_api_check_at = NOW() WHERE id = $1',
    [student.id]
  );

  return { checkedSteps };
}
