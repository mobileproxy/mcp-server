/**
 * Script-agnostic matching for location captions and operator names.
 *
 * The backend localizes get_geo_list captions only when Accept-Language is exactly "en"
 * ("en-US", "EN" or no header give Russian), and even then some captions stay in Cyrillic
 * ("Russia, Дзержинск", "Thailand, Пхукет"). Operator names mix both scripts too
 * ("Билайн (KG)", "megafone"). Agents may pass either script, so both sides are folded to
 * one Latin skeleton before comparing.
 */

const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  /* Ukrainian / Belarusian */
  і: 'i', ї: 'yi', є: 'ye', ґ: 'g', ў: 'u',
};

/**
 * Lowercase Latin skeleton: transliterate Cyrillic, strip diacritics, then collapse the
 * spelling variants romanizations disagree on (kh/h, j/y/i, ts/c, doubled letters,
 * initial "ye/ya/yu"), so "Казань", "Kazan" and "Kazan'" all become "kazan".
 */
export function foldName(s: string): string {
  const t = [...s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')]
    .map((c) => CYRILLIC[c] ?? c)
    .join('');
  return t
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/dzh/g, 'j')
    .replace(/kh/g, 'h')
    .replace(/shch/g, 'sch')
    .replace(/ts|tz|cz/g, 'c')
    .replace(/[jy]/g, 'i')
    .replace(/w/g, 'v')
    .replace(/x/g, 'ks')
    .replace(/(^| )i(?=[aeou])/g, '$1') /* Yerevan/Ереван, Yekaterinburg/Екатеринбург */
    .replace(/([aeou])i(?=[aeou])/g, '$1') /* -skoye/-ское */
    .replace(/([a-z])\1+/g, '$1')
    .replace(/([a-z]) (?=\d)/g, '$1') /* "Tele 2" = "tele2" */
    .trim();
}

/* Names whose English form is not a transliteration of the Russian one. Transliterations
   ("Novosibirsk", "Kazan") need no entry. */
const ALIAS_GROUPS: string[][] = [
  ['Moscow', 'Moskva', 'Москва'],
  ['Saint Petersburg', 'St Petersburg', 'Petersburg', 'Sankt-Peterburg', 'Санкт-Петербург', 'Петербург', 'SPb', 'СПб', 'Piter'],
  ['Rostov-on-Don', 'Rostov-na-Donu', 'Ростов-на-Дону'],
  ['Kyiv', 'Kiev', 'Киев', 'Київ'],
  ['Kharkiv', 'Kharkov', 'Харьков', 'Харків'],
  ['Lviv', 'Lvov', 'Львов', 'Львів'],
  ['Dnipro', 'Dnepr', 'Днепр', 'Дніпро'],
  ['Zaporizhzhia', 'Zaporozhye', 'Запорожье', 'Запоріжжя'],
  ['Mykolaiv', 'Nikolaev', 'Николаев', 'Миколаїв'],
  ['Chernihiv', 'Chernigov', 'Чернигов', 'Чернігів'],
  ['Chernivtsi', 'Chernovtsy', 'Черновцы', 'Чернівці'],
  ['Ivano-Frankivsk', 'Ivano-Frankovsk', 'Ивано-Франковск'],
  ['Ternopil', 'Ternopol', 'Тернополь'],
  ['Uzhhorod', 'Uzhgorod', 'Ужгород'],
  ['Chisinau', 'Kishinev', 'Кишинёв'],
  ['Balti', 'Beltsy', 'Бельцы'],
  ['Warsaw', 'Варшава'],
  ['Prague', 'Прага'],
  ['Bucharest', 'Бухарест'],
  ['Istanbul', 'Стамбул'],
  ['Paris', 'Париж'],
  ['Athens', 'Афины'],
  ['Munich', 'Мюнхен'],
  ['Lisbon', 'Лиссабон'],
  ['Belgrade', 'Белград'],
  ['Copenhagen', 'Копенгаген'],
  ['New York', 'Нью-Йорк'],
  ['Ho Chi Minh City', 'Хошимин'],
  /* Operators */
  ['Beeline', 'Билайн'],
  ['Kyivstar', 'Kievstar', 'Киевстар'],
  ['Rostelecom', 'Ростелеком'],
  ['Tattelecom', 'Таттелеком'],
];
const ALIASES = ALIAS_GROUPS.map((g) => g.map(foldName));

/**
 * True when `needle` (Latin or Cyrillic) starts a word of `haystack` once both are
 * folded, or when a known alternative name of the needle does ("Moscow" ~ "Москва").
 */
export function nameMatches(haystack: string, needle: string): boolean {
  const n = foldName(needle);
  if (!n) return true;
  const h = ` ${foldName(haystack)}`;
  const variants = new Set([n]);
  for (const group of ALIASES) {
    if (group.some((a) => a === n || (n.length >= 4 && a.startsWith(n)))) {
      for (const a of group) variants.add(a);
    }
  }
  for (const v of variants) if (h.includes(` ${v}`)) return true;
  return false;
}
