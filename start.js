/**
 * start.js — Bootstrap entry point
 *
 * Loads the Discord token from Google Drive + Fernet decryption BEFORE
 * any other module (especially core/config.js) is imported, so that
 * process.env.DISCORD_TOKEN is populated when config.js evaluates.
 */
import 'dotenv/config';
import { loadToken, loadOpenAiKey } from './core/tokenLoader.js';

try {
  await loadToken();
} catch (err) {
  console.error('[Bootstrap] Failed to load Discord token:', err.message);
  process.exit(1);
}

if (!process.env.OPENROUTER_API_KEY) {
  try {
    await loadOpenAiKey();
  } catch (err) {
    console.warn('[Bootstrap] OpenAI key unavailable — image classification disabled:', err.message);
  }
}

// Token is now in process.env.DISCORD_TOKEN — safe to load the rest of the app
await import('./index.js');
