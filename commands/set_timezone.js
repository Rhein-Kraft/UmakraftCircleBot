import { SlashCommandBuilder } from 'discord.js';
import { store } from '../core/store.js';

/**
 * Map Discord locale codes → best-guess IANA timezone.
 * Used for automatic detection on first interaction.
 */
export const LOCALE_TO_TZ = {
  ja:      'Asia/Tokyo',
  ko:      'Asia/Seoul',
  'zh-CN': 'Asia/Shanghai',
  'zh-TW': 'Asia/Taipei',
  vi:      'Asia/Ho_Chi_Minh',
  th:      'Asia/Bangkok',
  hi:      'Asia/Kolkata',
  id:      'Asia/Jakarta',
  tr:      'Europe/Istanbul',
  ru:      'Europe/Moscow',
  uk:      'Europe/Kiev',
  pl:      'Europe/Warsaw',
  cs:      'Europe/Prague',
  hu:      'Europe/Budapest',
  ro:      'Europe/Bucharest',
  bg:      'Europe/Sofia',
  el:      'Europe/Athens',
  lt:      'Europe/Vilnius',
  hr:      'Europe/Zagreb',
  fi:      'Europe/Helsinki',
  'sv-SE': 'Europe/Stockholm',
  no:      'Europe/Oslo',
  da:      'Europe/Copenhagen',
  nl:      'Europe/Amsterdam',
  de:      'Europe/Berlin',
  fr:      'Europe/Paris',
  it:      'Europe/Rome',
  'es-ES': 'Europe/Madrid',
  'en-GB': 'Europe/London',
  'pt-BR': 'America/Sao_Paulo',
  'en-US': 'America/New_York',
};

/**
 * All supported IANA timezones — sourced from SupportStandardTimeSetup.md.
 * Each entry: { iana, abbr, offset, label }
 *
 * DST-aware zones (e.g. America/New_York) automatically cover both Standard
 * and Daylight offsets — users do not need to pick PST vs PDT separately.
 */
export const TIMEZONE_LIST = [
  // ── UTC / GMT ────────────────────────────────────────────────────────────
  { iana: 'UTC',                             abbr: 'UTC',  offset: '+00:00', label: 'Coordinated Universal Time' },
  { iana: 'Europe/London',                   abbr: 'GMT',  offset: '+00:00', label: 'Greenwich Mean Time / British Summer Time' },
  { iana: 'Europe/Lisbon',                   abbr: 'WET',  offset: '+00:00', label: 'Western European Time — Portugal' },

  // ── Europe ───────────────────────────────────────────────────────────────
  { iana: 'Europe/Paris',                    abbr: 'CET',  offset: '+01:00', label: 'Central European Time — France, Germany, Spain, Italy' },
  { iana: 'Europe/Berlin',                   abbr: 'CET',  offset: '+01:00', label: 'Central European Time — Germany' },
  { iana: 'Europe/Madrid',                   abbr: 'CET',  offset: '+01:00', label: 'Central European Time — Spain' },
  { iana: 'Europe/Rome',                     abbr: 'CET',  offset: '+01:00', label: 'Central European Time — Italy' },
  { iana: 'Europe/Amsterdam',                abbr: 'CET',  offset: '+01:00', label: 'Central European Time — Netherlands' },
  { iana: 'Europe/Warsaw',                   abbr: 'CET',  offset: '+01:00', label: 'Central European Time — Poland' },
  { iana: 'Europe/Athens',                   abbr: 'EET',  offset: '+02:00', label: 'Eastern European Time — Greece' },
  { iana: 'Europe/Helsinki',                 abbr: 'EET',  offset: '+02:00', label: 'Eastern European Time — Finland' },
  { iana: 'Europe/Bucharest',                abbr: 'EET',  offset: '+02:00', label: 'Eastern European Time — Romania' },
  { iana: 'Europe/Kiev',                     abbr: 'EET',  offset: '+02:00', label: 'Eastern European Time — Ukraine' },
  { iana: 'Europe/Stockholm',                abbr: 'CET',  offset: '+01:00', label: 'Central European Time — Sweden' },
  { iana: 'Europe/Oslo',                     abbr: 'CET',  offset: '+01:00', label: 'Central European Time — Norway' },
  { iana: 'Europe/Copenhagen',               abbr: 'CET',  offset: '+01:00', label: 'Central European Time — Denmark' },
  { iana: 'Europe/Prague',                   abbr: 'CET',  offset: '+01:00', label: 'Central European Time — Czech Republic' },
  { iana: 'Europe/Budapest',                 abbr: 'CET',  offset: '+01:00', label: 'Central European Time — Hungary' },
  { iana: 'Europe/Sofia',                    abbr: 'EET',  offset: '+02:00', label: 'Eastern European Time — Bulgaria' },
  { iana: 'Europe/Vilnius',                  abbr: 'EET',  offset: '+02:00', label: 'Eastern European Time — Lithuania' },
  { iana: 'Europe/Zagreb',                   abbr: 'CET',  offset: '+01:00', label: 'Central European Time — Croatia' },
  { iana: 'Europe/Moscow',                   abbr: 'MSK',  offset: '+03:00', label: 'Moscow Standard Time — Russia' },
  { iana: 'Europe/Istanbul',                 abbr: 'TRT',  offset: '+03:00', label: 'Turkey Time' },

  // ── Middle East / Gulf ───────────────────────────────────────────────────
  { iana: 'Asia/Dubai',                      abbr: 'GST',  offset: '+04:00', label: 'Gulf Standard Time — UAE, Oman' },
  { iana: 'Asia/Riyadh',                     abbr: 'AST',  offset: '+03:00', label: 'Arabia Standard Time — Saudi Arabia, Qatar, Kuwait' },

  // ── Asia ─────────────────────────────────────────────────────────────────
  { iana: 'Asia/Karachi',                    abbr: 'PKT',  offset: '+05:00', label: 'Pakistan Standard Time' },
  { iana: 'Asia/Kolkata',                    abbr: 'IST',  offset: '+05:30', label: 'India Standard Time' },
  { iana: 'Asia/Kathmandu',                  abbr: 'NPT',  offset: '+05:45', label: 'Nepal Time' },
  { iana: 'Asia/Dhaka',                      abbr: 'BST',  offset: '+06:00', label: 'Bangladesh Standard Time' },
  { iana: 'Asia/Yangon',                     abbr: 'MMT',  offset: '+06:30', label: 'Myanmar Time' },
  { iana: 'Asia/Bangkok',                    abbr: 'ICT',  offset: '+07:00', label: 'Indochina Time — Thailand, Cambodia, Laos' },
  { iana: 'Asia/Ho_Chi_Minh',                abbr: 'ICT',  offset: '+07:00', label: 'Indochina Time — Vietnam' },
  { iana: 'Asia/Jakarta',                    abbr: 'WIB',  offset: '+07:00', label: 'Western Indonesia Time — Jakarta' },
  { iana: 'Asia/Shanghai',                   abbr: 'CST',  offset: '+08:00', label: 'China Standard Time' },
  { iana: 'Asia/Taipei',                     abbr: 'CST',  offset: '+08:00', label: 'China Standard Time — Taiwan' },
  { iana: 'Asia/Singapore',                  abbr: 'SGT',  offset: '+08:00', label: 'Singapore Standard Time' },
  { iana: 'Asia/Kuala_Lumpur',               abbr: 'MYT',  offset: '+08:00', label: 'Malaysia Time' },
  { iana: 'Asia/Manila',                     abbr: 'PHT',  offset: '+08:00', label: 'Philippine Standard Time' },
  { iana: 'Asia/Makassar',                   abbr: 'WITA', offset: '+08:00', label: 'Central Indonesia Time — Bali' },
  { iana: 'Australia/Perth',                 abbr: 'AWST', offset: '+08:00', label: 'Australian Western Standard Time' },
  { iana: 'Asia/Tokyo',                      abbr: 'JST',  offset: '+09:00', label: 'Japan Standard Time' },
  { iana: 'Asia/Seoul',                      abbr: 'KST',  offset: '+09:00', label: 'Korea Standard Time' },
  { iana: 'Australia/Darwin',                abbr: 'ACST', offset: '+09:30', label: 'Australian Central Standard Time' },
  { iana: 'Australia/Sydney',                abbr: 'AEST', offset: '+10:00', label: 'Australian Eastern Standard Time — Sydney' },
  { iana: 'Australia/Melbourne',             abbr: 'AEST', offset: '+10:00', label: 'Australian Eastern Standard Time — Melbourne' },
  { iana: 'Pacific/Auckland',                abbr: 'NZST', offset: '+12:00', label: 'New Zealand Standard Time' },

  // ── Americas ─────────────────────────────────────────────────────────────
  { iana: 'Pacific/Honolulu',                abbr: 'HST',  offset: '-10:00', label: 'Hawaii Standard Time' },
  { iana: 'America/Anchorage',               abbr: 'AKST', offset: '-09:00', label: 'Alaska Standard Time' },
  { iana: 'America/Los_Angeles',             abbr: 'PST',  offset: '-08:00', label: 'Pacific Standard Time — Western USA (covers PDT in summer)' },
  { iana: 'America/Vancouver',               abbr: 'PST',  offset: '-08:00', label: 'Pacific Standard Time — Canada West' },
  { iana: 'America/Denver',                  abbr: 'MST',  offset: '-07:00', label: 'Mountain Standard Time — USA (covers MDT in summer)' },
  { iana: 'America/Chicago',                 abbr: 'CST',  offset: '-06:00', label: 'Central Standard Time — USA (covers CDT in summer)' },
  { iana: 'America/Mexico_City',             abbr: 'CST',  offset: '-06:00', label: 'Central Standard Time — Mexico' },
  { iana: 'America/New_York',                abbr: 'EST',  offset: '-05:00', label: 'Eastern Standard Time — USA (covers EDT in summer)' },
  { iana: 'America/Toronto',                 abbr: 'EST',  offset: '-05:00', label: 'Eastern Standard Time — Canada East' },
  { iana: 'America/Puerto_Rico',             abbr: 'AST',  offset: '-04:00', label: 'Atlantic Standard Time — Puerto Rico, Caribbean' },
  { iana: 'America/St_Johns',                abbr: 'NST',  offset: '-03:30', label: 'Newfoundland Standard Time' },
  { iana: 'America/Sao_Paulo',               abbr: 'BRT',  offset: '-03:00', label: 'Brasília Time — Brazil' },
  { iana: 'America/Argentina/Buenos_Aires',  abbr: 'ART',  offset: '-03:00', label: 'Argentina Time' },
];

// Flat list of IANA names for validation / simple lookups
export const COMMON_TIMEZONES = [...new Set(TIMEZONE_LIST.map(t => t.iana))];

// Abbreviation → first matching IANA name (for alias search)
const ABBR_TO_IANA = {};
for (const t of TIMEZONE_LIST) {
  if (!ABBR_TO_IANA[t.abbr.toUpperCase()]) {
    ABBR_TO_IANA[t.abbr.toUpperCase()] = t.iana;
  }
}

export const data = new SlashCommandBuilder()
  .setName('set_timezone')
  .setDescription(
    'Override your timezone for greeting messages (auto-detected from your Discord locale by default)'
  )
  .addStringOption(opt =>
    opt
      .setName('timezone')
      .setDescription('Type your timezone or abbreviation — e.g. JST, PHT, Asia/Tokyo')
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused().trim();
  const query   = focused.toLowerCase();

  let results;

  if (!query) {
    // No input yet — show a curated starter list of the most common zones
    const starters = [
      'Asia/Tokyo', 'Asia/Seoul', 'Asia/Manila', 'Asia/Singapore',
      'Asia/Shanghai', 'Asia/Bangkok', 'Asia/Jakarta', 'Asia/Kolkata',
      'America/New_York', 'America/Los_Angeles', 'Europe/London', 'UTC',
    ];
    results = TIMEZONE_LIST.filter(t => starters.includes(t.iana));
  } else {
    // Search by IANA name, abbreviation, label, or UTC offset
    results = TIMEZONE_LIST.filter(t =>
      t.iana.toLowerCase().includes(query)   ||
      t.abbr.toLowerCase().includes(query)   ||
      t.label.toLowerCase().includes(query)  ||
      t.offset.includes(query)
    );
  }

  // Deduplicate by IANA name, keep first match
  const seen = new Set();
  const deduped = [];
  for (const t of results) {
    if (!seen.has(t.iana)) {
      seen.add(t.iana);
      deduped.push(t);
    }
  }

  const now = new Date();
  const choices = deduped.slice(0, 25).map(t => {
    const localTime = now.toLocaleString('en-US', {
      timeZone: t.iana,
      hour:     '2-digit',
      minute:   '2-digit',
      hour12:   false,
    });
    return {
      name:  `[${t.abbr}] ${t.iana}  — now ${localTime} (UTC${t.offset})`,
      value: t.iana,
    };
  });

  await interaction.respond(choices);
}

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const raw = interaction.options.getString('timezone', true).trim();

  // Accept abbreviations as input (e.g. "JST" → "Asia/Tokyo")
  const tz = ABBR_TO_IANA[raw.toUpperCase()] ?? raw;

  try {
    new Intl.DateTimeFormat('en', { timeZone: tz }).format();
  } catch {
    await interaction.editReply(
      `❌ **"${raw}"** is not a recognised timezone.\n` +
      `Please pick one from the suggestions, or use a valid IANA name like \`Asia/Tokyo\` or abbreviation like \`JST\`.`
    );
    return;
  }

  await store.setTimezone(interaction.user.id, tz);

  // Find matching entry for display
  const entry = TIMEZONE_LIST.find(t => t.iana === tz);
  const abbrDisplay = entry ? ` (${entry.abbr})` : '';

  const localTime = new Date().toLocaleString('en-US', {
    timeZone:  tz,
    weekday:   'short',
    hour:      '2-digit',
    minute:    '2-digit',
    hour12:    false,
  });

  await interaction.editReply(
    `✅ Timezone set to **${tz}**${abbrDisplay}.\n` +
    `Your current local time: **${localTime}**\n\n` +
    `Greetings will now arrive at the right time for you.`
  );
}
