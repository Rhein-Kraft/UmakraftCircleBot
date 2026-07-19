/**
 * utils/imageClassifier.js
 * ─────────────────────────
 * PIPELINE 2 — IMAGE ANALYSIS
 * Input:  image URL (user-uploaded Uma Musume screenshot)
 * Output: structured JSON (screen_type, trainer_id, trainer_name, rank, confidence)
 * Engine: GPT-4o Vision (OpenAI) — probabilistic AI inference
 * Nature: AI-based image understanding, NOT deterministic rendering
 * See:    utils/imageReport.js for Pipeline 1 (image generation)
 * ─────────────────────────────────────────────────────────────────
 * Uses GPT-4o Vision to classify an Uma Musume screenshot and extract
 * identity information from it.
 *
 * Returns a structured result:
 *   screen_type : 'trainer_card' | 'profile_ui' | 'other' | 'unknown'
 *   trainer_id  : string | null   ← primary identity key
 *   trainer_name: string | null
 *   rank        : string | null
 *   club_name   : string | null
 *   confidence  : 0–100
 *
 * On API failure returns { screen_type: 'unknown', confidence: 0, ... nulls }
 * so the bot never crashes (fail-open).
 */

import OpenAI from 'openai';
import { log } from '../core/log.js';

let _client = null;

function getClient() {
  if (!_client) {
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    const openAiKey = process.env.OPENAI_API_KEY;

    if (openRouterKey) {
      _client = new OpenAI({
        apiKey: openRouterKey,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'https://github.com/UmadolProject/uma-circle-bot',
          'X-Title': 'UmadolProject',
        },
      });
    } else if (openAiKey) {
      _client = new OpenAI({ apiKey: openAiKey });
    } else {
      throw new Error('imageClassifier: neither OPENROUTER_API_KEY nor OPENAI_API_KEY is set');
    }
  }
  return _client;
}

const PROMPT = `You are analyzing a screenshot from the mobile game Uma Musume Pretty Derby.

PRIMARY OBJECTIVE:
Determine whether the image is a Trainer Card, Profile UI, or another screen, AND extract the Trainer ID. Trainer ID is the primary identity key and must always be prioritized.

SCREEN CLASSIFICATION:

1. TRAINER CARD
   - Trainer ID is clearly displayed and prominent
   - Designed as a shareable identity card
   - Contains trainer name and trainer rank
   - Compact layout with minimal navigation elements
   - Focused on identity information
   - Decorative card-style presentation

2. PROFILE UI
   - Full in-game interface visible
   - Navigation buttons or menus present
   - Edit profile or settings controls visible
   - Club information may be displayed
   - Statistics, achievements, titles, or detailed account information present
   - Multiple panels, tabs, or sections visible
   - Designed for account management rather than sharing

IDENTITY EXTRACTION:
Always extract: Trainer ID, Trainer Name, Rank/Class (if visible), Club Name (if visible).

Trainer ID format: typically 12 digits, may be displayed with spaces (e.g. "612 856 830 731"). Extract the digits only, no spaces.

OUTPUT FORMAT (respond ONLY with valid JSON, no other text):
{
  "screen_type": "trainer_card | profile_ui | other | unknown",
  "trainer_id": "digits only, no spaces, or null",
  "trainer_name": "value or null",
  "rank": "value or null",
  "club_name": "value or null",
  "confidence": <integer 0-100, your confidence that screen_type is correct>
}`;

/** @returns {{ screen_type: string, trainer_id: string|null, trainer_name: string|null, rank: string|null, club_name: string|null, confidence: number }} */
function failResult() {
  return { screen_type: 'unknown', trainer_id: null, trainer_name: null, rank: null, club_name: null, confidence: 0 };
}

/**
 * Classify an Uma Musume image and extract identity data.
 * @param {string} imageUrl
 * @returns {Promise<{ screen_type: 'trainer_card'|'profile_ui'|'other'|'unknown', trainer_id: string|null, trainer_name: string|null, rank: string|null, club_name: string|null, confidence: number }>}
 */
export async function classifyUmaImage(imageUrl) {
  try {
    const openai = getClient();
    const response = await openai.chat.completions.create({
      model: process.env.OPENROUTER_API_KEY ? 'openai/gpt-4o' : 'gpt-4o',
      max_tokens: 250,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? '';

    // Strip any markdown code fences if present
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      log.warn(`imageClassifier: could not parse JSON response: "${raw}" — treating as unknown`);
      return failResult();
    }

    const validTypes = ['trainer_card', 'profile_ui', 'other', 'unknown'];
    const screen_type = validTypes.includes(parsed.screen_type) ? parsed.screen_type : 'unknown';

    // Sanitize trainer_id: digits only, 8–15 chars
    let trainer_id = null;
    if (parsed.trainer_id) {
      const digits = String(parsed.trainer_id).replace(/\D/g, '');
      if (digits.length >= 8 && digits.length <= 15) trainer_id = digits;
    }

    const result = {
      screen_type,
      trainer_id,
      trainer_name: parsed.trainer_name ?? null,
      rank:         parsed.rank ?? null,
      club_name:    parsed.club_name ?? null,
      confidence:   typeof parsed.confidence === 'number' ? Math.min(100, Math.max(0, parsed.confidence)) : 0,
    };

    log.debug(`imageClassifier: ${screen_type} (conf=${result.confidence}) id=${trainer_id ?? 'none'} name=${result.trainer_name ?? 'none'}`);
    return result;

  } catch (err) {
    log.warn('imageClassifier: classification failed — treating as unknown:', err.message);
    return failResult();
  }
}
