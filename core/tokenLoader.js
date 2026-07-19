// @ts-check
/**
 * tokenLoader.js
 * ──────────────
 * Fully automatic secret loading on any fresh GitHub import. Zero manual setup.
 *
 * Discord token boot chain:
 *   1. If DISCORD_TOKEN / DISCORD_BOT_TOKEN is set in env → use it directly (skip chain)
 *   2. Read Fernet key from secrets/token_enc.key (repo) or TOKEN_ENC_KEY env var
 *   3. Read secrets/token.enc from repo → Fernet decrypt → Discord bot token
 *   4. Inject into process.env.DISCORD_TOKEN for the rest of the app
 *
 * OpenAI key boot chain:
 *   1. Same Fernet key (already loaded)
 *   2. Fetch openai_key.enc from GitHub Gist → decrypt → OpenAI API key
 *   3. Inject into process.env.OPENAI_API_KEY for the rest of the app
 *
 * Resilience:
 *   - Network steps (OpenAI key Gist) retry up to 3 times with exponential backoff
 *   - All HTTP requests are bounded by a 10-second timeout
 *
 * Security model:
 *   - Fernet key alone → useless without token.enc
 *   - token.enc alone → useless without the Fernet key to decrypt it
 *   - Both must be compromised simultaneously to expose the token
 *
 * Fernet spec: https://github.com/fernet/spec/blob/master/Spec.md
 *   Key (32 bytes, base64url): first 16 = signing key, last 16 = AES-128-CBC key
 *   Token (base64url): version(1) | timestamp(8) | iv(16) | ciphertext | hmac(32)
 */

import crypto from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import https from 'node:https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(__dirname);
const SECRETS_DIR = path.join(projectRoot, 'secrets');

const OPENAI_KEY_GIST_URL =
  'https://gist.githubusercontent.com/Falco-chan/8dd939b3e7e91ed7d5d18f128abe8e8c/raw/7e2c4198ad81162a6d559f71452b0c2c0263d52d/openai_key.enc';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2_000;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Read the Fernet key — file first, env var as fallback.
 * @returns {string}
 */
function resolveEncKey() {
  const keyFile = path.join(SECRETS_DIR, 'token_enc.key');
  if (existsSync(keyFile)) return readFileSync(keyFile, 'utf8').trim();

  const keyEnv = process.env.TOKEN_ENC_KEY;
  if (keyEnv) return keyEnv;

  throw new Error(
    '[TokenLoader] Fernet key not found. Expected secrets/token_enc.key in the repo, or TOKEN_ENC_KEY set as an environment variable.'
  );
}

/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch raw text from a URL with a timeout. No retries — handled by withRetry().
 * @param {string} url
 * @returns {Promise<string>}
 */
function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, res => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });

    req.setTimeout(FETCH_TIMEOUT_MS, () => {
      req.destroy(new Error(`Request timed out after ${FETCH_TIMEOUT_MS / 1000}s (${url})`));
    });

    req.on('error', reject);
  });
}

/**
 * Retry an async function up to maxRetries times with exponential backoff.
 * Logs each failed attempt so the exact step is visible in the console.
 * @template T
 * @param {() => Promise<T>} fn
 * @param {string} label  - human-readable step name for log output
 * @param {number} [maxRetries]
 * @returns {Promise<T>}
 */
async function withRetry(fn, label, maxRetries = MAX_RETRIES) {
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isLast = attempt === maxRetries;
      if (isLast) break;
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.warn(
        `[TokenLoader] ${label} — attempt ${attempt}/${maxRetries} failed: ${err.message}. Retrying in ${delay / 1000}s…`
      );
      await sleep(delay);
    }
  }
  throw new Error(`[TokenLoader] ${label} failed after ${maxRetries} attempts: ${lastErr.message}`);
}

/**
 * Decrypt a Fernet token.
 * @param {string} fernetToken  - base64url Fernet token string
 * @param {string} keyB64       - base64url Fernet key (32 bytes)
 * @returns {string}            - decrypted plaintext
 */
function fernetDecrypt(fernetToken, keyB64) {
  const token = Buffer.from(fernetToken.trim(), 'base64');

  if (token[0] !== 0x80) {
    throw new Error(`[TokenLoader] Unsupported Fernet version: 0x${token[0].toString(16)}`);
  }

  const masterKey = Buffer.from(keyB64, 'base64');
  if (masterKey.length !== 32) {
    throw new Error(`[TokenLoader] Fernet key must be 32 bytes, got ${masterKey.length}`);
  }

  const signingKey = masterKey.subarray(0, 16);
  const encryptionKey = masterKey.subarray(16, 32);

  const hmacReceived = token.subarray(token.length - 32);
  const payload = token.subarray(0, token.length - 32);

  const hmacExpected = crypto.createHmac('sha256', signingKey).update(payload).digest();
  if (!crypto.timingSafeEqual(hmacReceived, hmacExpected)) {
    throw new Error('[TokenLoader] Fernet HMAC verification failed — wrong key or corrupted data');
  }

  const iv = token.subarray(9, 25);
  const ciphertext = token.subarray(25, token.length - 32);

  const decipher = crypto.createDecipheriv('aes-128-cbc', encryptionKey, iv);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  // Strip PKCS7 padding bytes and any non-printable characters, then trim whitespace
  const plaintext = decrypted.toString('utf8').replace(/[\x00-\x1F\x7F]+$/g, '').trim();
  return plaintext;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Load the Discord bot token automatically.
 *
 * On any fresh GitHub import into Replit:
 *   1. If DISCORD_TOKEN / DISCORD_BOT_TOKEN env var is set → use it directly.
 *   2. Read Fernet key from secrets/token_enc.key (or TOKEN_ENC_KEY env var).
 *   3. Read secrets/token.enc from the repo → Fernet decrypt → Discord token.
 *   4. Inject into process.env.DISCORD_TOKEN for the rest of the app.
 *
 * @returns {Promise<string>}
 */
export async function loadToken() {
  const envToken = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN || process.env.Discord_Bot_Token;
  if (envToken) {
    process.env.DISCORD_TOKEN = envToken;
    return envToken;
  }

  console.log('[TokenLoader] Starting token load from secrets/token.enc…');

  let encKey;
  try {
    encKey = resolveEncKey();
  } catch (err) {
    throw new Error(`[TokenLoader] Step 1 (Fernet key): ${err.message}`, { cause: err });
  }

  const tokenEncFile = path.join(SECRETS_DIR, 'token.enc');
  if (!existsSync(tokenEncFile)) {
    throw new Error(
      '[TokenLoader] Step 2 (token.enc): secrets/token.enc not found in repo. ' +
      'Run `node scripts/encryptToken.js` to regenerate it.'
    );
  }

  let tokenEncStr;
  try {
    tokenEncStr = readFileSync(tokenEncFile, 'utf8').trim();
  } catch (err) {
    throw new Error(`[TokenLoader] Step 2 (read token.enc): ${err.message}`, { cause: err });
  }

  let token;
  try {
    token = fernetDecrypt(tokenEncStr, encKey);
  } catch (err) {
    throw new Error(`[TokenLoader] Step 3 (decrypt token): ${err.message}`, { cause: err });
  }

  if (!token) throw new Error('[TokenLoader] Step 3 (decrypt token): result was empty');

  console.log('[TokenLoader] Token loaded successfully from secrets/token.enc.');
  process.env.DISCORD_TOKEN = token;
  return token;
}

/**
 * Load the OpenAI API key automatically from an encrypted GitHub Gist.
 *
 * Uses the same Fernet key as loadToken(). If OPENAI_API_KEY is already
 * set in the environment, skips the chain entirely.
 *
 * @returns {Promise<string>}
 */
export async function loadOpenAiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;

  console.log('[TokenLoader] Fetching OpenAI key from Gist…');

  let encKey;
  try {
    encKey = resolveEncKey();
  } catch (err) {
    throw new Error(`[TokenLoader] OpenAI key step 1 (Fernet key): ${err.message}`, { cause: err });
  }

  let encrypted;
  try {
    encrypted = await withRetry(
      () => fetchText(OPENAI_KEY_GIST_URL),
      'Fetch openai_key.enc from Gist'
    );
  } catch (err) {
    throw new Error(`[TokenLoader] OpenAI key step 2 (Gist fetch): ${err.message}`, { cause: err });
  }

  let apiKey;
  try {
    apiKey = fernetDecrypt(encrypted, encKey);
  } catch (err) {
    throw new Error(`[TokenLoader] OpenAI key step 3 (decrypt): ${err.message}`, { cause: err });
  }

  if (!apiKey) throw new Error('[TokenLoader] OpenAI key step 3 (decrypt): result was empty');

  console.log('[TokenLoader] OpenAI key loaded successfully.');
  process.env.OPENAI_API_KEY = apiKey;
  return apiKey;
}
