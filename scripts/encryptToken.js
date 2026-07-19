/**
 * scripts/encryptToken.js
 * One-time utility: encrypts DISCORD_TOKEN using the existing Fernet key
 * and writes the result to secrets/token.enc
 *
 * Usage: node scripts/encryptToken.js
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(__dirname);

function fernetEncrypt(plaintext, keyB64) {
  const masterKey = Buffer.from(keyB64, 'base64');
  if (masterKey.length !== 32) throw new Error(`Fernet key must be 32 bytes, got ${masterKey.length}`);

  const signingKey = masterKey.subarray(0, 16);
  const encryptionKey = masterKey.subarray(16, 32);

  const version = Buffer.from([0x80]);
  const timestamp = Buffer.alloc(8);
  const now = BigInt(Math.floor(Date.now() / 1000));
  timestamp.writeBigUInt64BE(now);
  const iv = crypto.randomBytes(16);

  // PKCS7 pad to 16-byte block boundary
  const ptBuf = Buffer.from(plaintext, 'utf8');
  const padLen = 16 - (ptBuf.length % 16);
  const padded = Buffer.concat([ptBuf, Buffer.alloc(padLen, padLen)]);

  const cipher = crypto.createCipheriv('aes-128-cbc', encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(padded), cipher.final()]);

  const payload = Buffer.concat([version, timestamp, iv, ciphertext]);
  const hmac = crypto.createHmac('sha256', signingKey).update(payload).digest();
  const token = Buffer.concat([payload, hmac]);

  return token.toString('base64');
}

const keyFile = path.join(projectRoot, 'secrets', 'token_enc.key');
if (!existsSync(keyFile)) {
  console.error('ERROR: secrets/token_enc.key not found');
  process.exit(1);
}

const encKey = readFileSync(keyFile, 'utf8').trim();
const token = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error('ERROR: DISCORD_TOKEN is not set in environment');
  process.exit(1);
}

const encrypted = fernetEncrypt(token, encKey);
const outFile = path.join(projectRoot, 'secrets', 'token.enc');
writeFileSync(outFile, encrypted, 'utf8');
console.log(`token.enc written to: ${outFile}`);
console.log(`Encrypted length: ${encrypted.length} chars`);
