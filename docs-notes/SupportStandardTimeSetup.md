# SupportStandardTimeSetup.md

## 🌍 Supported Standard Time Zones

Use the following standard time abbreviations when displaying timestamps, scheduling events, or converting times.

> **Bot tip:** In `/set_timezone` you can type either the abbreviation (e.g. `JST`) or the IANA name (e.g. `Asia/Tokyo`) — both work. DST-aware zones (marked †) automatically switch between Standard and Daylight offsets; you do not need to set `PST` and `PDT` separately.

---

### UTC / GMT

| Abbreviation | UTC Offset | Standard Time Name | IANA Timezone | Common Countries / Regions |
|--------------|-----------:|--------------------|---------------|----------------------------|
| UTC  | +00:00 | Coordinated Universal Time      | `UTC`           | Worldwide |
| GMT  | +00:00 | Greenwich Mean Time             | `Europe/London` | United Kingdom (Winter), Ireland |
| BST  | +01:00 | British Summer Time             | `Europe/London` † | United Kingdom (Summer) |
| WET  | +00:00 | Western European Time           | `Europe/Lisbon` | Portugal, Morocco (varies) |
| WEST | +01:00 | Western European Summer Time    | `Europe/Lisbon` † | Portugal (Summer) |

---

### Europe

| Abbreviation | UTC Offset | Standard Time Name | IANA Timezone | Common Countries / Regions |
|--------------|-----------:|--------------------|---------------|----------------------------|
| CET  | +01:00 | Central European Time           | `Europe/Paris`      | France |
| CET  | +01:00 | Central European Time           | `Europe/Berlin`     | Germany |
| CET  | +01:00 | Central European Time           | `Europe/Madrid`     | Spain |
| CET  | +01:00 | Central European Time           | `Europe/Rome`       | Italy |
| CET  | +01:00 | Central European Time           | `Europe/Amsterdam`  | Netherlands |
| CET  | +01:00 | Central European Time           | `Europe/Warsaw`     | Poland |
| CET  | +01:00 | Central European Time           | `Europe/Stockholm`  | Sweden |
| CET  | +01:00 | Central European Time           | `Europe/Oslo`       | Norway |
| CET  | +01:00 | Central European Time           | `Europe/Copenhagen` | Denmark |
| CET  | +01:00 | Central European Time           | `Europe/Prague`     | Czech Republic |
| CET  | +01:00 | Central European Time           | `Europe/Budapest`   | Hungary |
| CET  | +01:00 | Central European Time           | `Europe/Zagreb`     | Croatia |
| CEST | +02:00 | Central European Summer Time    | `Europe/Paris` †    | Most of Europe (Summer) |
| EET  | +02:00 | Eastern European Time           | `Europe/Helsinki`   | Finland |
| EET  | +02:00 | Eastern European Time           | `Europe/Athens`     | Greece |
| EET  | +02:00 | Eastern European Time           | `Europe/Bucharest`  | Romania |
| EET  | +02:00 | Eastern European Time           | `Europe/Kiev`       | Ukraine |
| EET  | +02:00 | Eastern European Time           | `Europe/Sofia`      | Bulgaria |
| EET  | +02:00 | Eastern European Time           | `Europe/Vilnius`    | Lithuania |
| EEST | +03:00 | Eastern European Summer Time    | `Europe/Helsinki` † | Eastern Europe (Summer) |
| MSK  | +03:00 | Moscow Standard Time            | `Europe/Moscow`     | Russia (Moscow) |
| TRT  | +03:00 | Turkey Time                     | `Europe/Istanbul`   | Turkey |

---

### Middle East / Gulf

| Abbreviation | UTC Offset | Standard Time Name | IANA Timezone | Common Countries / Regions |
|--------------|-----------:|--------------------|---------------|----------------------------|
| AST  | +03:00 | Arabia Standard Time  | `Asia/Riyadh` | Saudi Arabia, Qatar, Kuwait, Bahrain |
| GST  | +04:00 | Gulf Standard Time    | `Asia/Dubai`  | United Arab Emirates, Oman |

---

### Asia

| Abbreviation | UTC Offset | Standard Time Name | IANA Timezone | Common Countries / Regions |
|--------------|-----------:|--------------------|---------------|----------------------------|
| PKT  | +05:00 | Pakistan Standard Time      | `Asia/Karachi`      | Pakistan |
| IST  | +05:30 | India Standard Time         | `Asia/Kolkata`      | India |
| NPT  | +05:45 | Nepal Time                  | `Asia/Kathmandu`    | Nepal |
| BST  | +06:00 | Bangladesh Standard Time    | `Asia/Dhaka`        | Bangladesh |
| MMT  | +06:30 | Myanmar Time                | `Asia/Yangon`       | Myanmar |
| ICT  | +07:00 | Indochina Time              | `Asia/Bangkok`      | Thailand, Cambodia, Laos |
| ICT  | +07:00 | Indochina Time              | `Asia/Ho_Chi_Minh`  | Vietnam |
| WIB  | +07:00 | Western Indonesia Time      | `Asia/Jakarta`      | Indonesia (Jakarta) |
| CST  | +08:00 | China Standard Time         | `Asia/Shanghai`     | China |
| CST  | +08:00 | China Standard Time         | `Asia/Taipei`       | Taiwan |
| SGT  | +08:00 | Singapore Standard Time     | `Asia/Singapore`    | Singapore |
| MYT  | +08:00 | Malaysia Time               | `Asia/Kuala_Lumpur` | Malaysia |
| PHT  | +08:00 | Philippine Standard Time    | `Asia/Manila`       | Philippines |
| WITA | +08:00 | Central Indonesia Time      | `Asia/Makassar`     | Indonesia (Bali) |
| JST  | +09:00 | Japan Standard Time         | `Asia/Tokyo`        | Japan |
| KST  | +09:00 | Korea Standard Time         | `Asia/Seoul`        | South Korea |

---

### Australia / Pacific

| Abbreviation | UTC Offset | Standard Time Name | IANA Timezone | Common Countries / Regions |
|--------------|-----------:|--------------------|---------------|----------------------------|
| AWST | +08:00 | Australian Western Standard Time  | `Australia/Perth`     | Australia (West) |
| ACST | +09:30 | Australian Central Standard Time  | `Australia/Darwin`    | Australia (Central) |
| AEST | +10:00 | Australian Eastern Standard Time  | `Australia/Sydney`    | Australia (Sydney) |
| AEST | +10:00 | Australian Eastern Standard Time  | `Australia/Melbourne` | Australia (Melbourne) |
| NZST | +12:00 | New Zealand Standard Time         | `Pacific/Auckland`    | New Zealand |
| HST  | -10:00 | Hawaii Standard Time              | `Pacific/Honolulu`    | Hawaii (USA) |

---

### Americas

| Abbreviation | UTC Offset | Standard Time Name | IANA Timezone | Common Countries / Regions |
|--------------|-----------:|--------------------|---------------|----------------------------|
| AKST | -09:00 | Alaska Standard Time        | `America/Anchorage`              | Alaska (USA) |
| PST  | -08:00 | Pacific Standard Time       | `America/Los_Angeles` †          | Western USA |
| PST  | -08:00 | Pacific Standard Time       | `America/Vancouver` †            | Canada (West) |
| PDT  | -07:00 | Pacific Daylight Time       | `America/Los_Angeles` †          | Western USA (Summer) |
| MST  | -07:00 | Mountain Standard Time      | `America/Denver` †               | Mountain USA |
| MDT  | -06:00 | Mountain Daylight Time      | `America/Denver` †               | Mountain USA (Summer) |
| CST  | -06:00 | Central Standard Time       | `America/Chicago` †              | Central USA, Canada |
| CST  | -06:00 | Central Standard Time       | `America/Mexico_City` †          | Mexico |
| CDT  | -05:00 | Central Daylight Time       | `America/Chicago` †              | Central USA (Summer) |
| EST  | -05:00 | Eastern Standard Time       | `America/New_York` †             | Eastern USA |
| EST  | -05:00 | Eastern Standard Time       | `America/Toronto` †              | Canada (East) |
| EDT  | -04:00 | Eastern Daylight Time       | `America/New_York` †             | Eastern USA (Summer) |
| AST  | -04:00 | Atlantic Standard Time      | `America/Puerto_Rico`            | Puerto Rico, Caribbean |
| NST  | -03:30 | Newfoundland Standard Time  | `America/St_Johns`               | Newfoundland (Canada) |
| BRT  | -03:00 | Brasília Time               | `America/Sao_Paulo`              | Brazil |
| ART  | -03:00 | Argentina Time              | `America/Argentina/Buenos_Aires` | Argentina |

† DST-aware: the IANA zone handles Standard ↔ Daylight switching automatically.

---

## Bot Usage — `/set_timezone`

You can set your timezone three ways:

```
/set_timezone JST                        ← abbreviation
/set_timezone Asia/Tokyo                 ← IANA name
/set_timezone PHT                        ← abbreviation → resolves to Asia/Manila
```

The autocomplete will suggest matching zones as you type — search by abbreviation, IANA name, region name, or UTC offset.

---

## Recommended Internal Storage

Always store timestamps in:

- UTC (ISO 8601)
- Example: `2026-07-05T13:45:00Z`

Display to users using their preferred timezone whenever possible.

---

## Supported Format Examples

```
UTC  : 2026-07-05 12:30 UTC
PHT  : 2026-07-05 20:30 PHT     → Asia/Manila
JST  : 2026-07-05 21:30 JST     → Asia/Tokyo
KST  : 2026-07-05 21:30 KST     → Asia/Seoul
SGT  : 2026-07-05 20:30 SGT     → Asia/Singapore
AEST : 2026-07-05 22:30 AEST    → Australia/Sydney
IST  : 2026-07-05 18:00 IST     → Asia/Kolkata
GMT  : 2026-07-05 12:30 GMT     → Europe/London
CET  : 2026-07-05 13:30 CET     → Europe/Paris
EST  : 2026-07-05 07:30 EST     → America/New_York
CST  : 2026-07-05 06:30 CST     → America/Chicago
MST  : 2026-07-05 05:30 MST     → America/Denver
PST  : 2026-07-05 04:30 PST     → America/Los_Angeles
```

---

## Notes

- Prefer region-specific abbreviations (PHT, JST, KST, SGT, etc.) when known.
- DST-aware IANA zones (e.g. `America/New_York`) automatically cover both Standard and Daylight offsets — no need to pick `EST` and `EDT` separately.
- UTC is the authoritative internal reference; always convert from UTC for display.
- Abbreviations like `CST`, `AST`, and `BST` are ambiguous across regions — the bot resolves them to the most common IANA zone. Use the full IANA name if precision is needed.
