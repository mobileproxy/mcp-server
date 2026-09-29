import { describe, expect, it } from 'vitest';
import { foldName, nameMatches } from '../src/utils/geo-match.js';

describe('foldName', () => {
  it('folds Latin and Cyrillic spellings to one skeleton', () => {
    for (const [a, b] of [
      ['Казань', 'Kazan'],
      ['Нижний Новгород', 'Nizhny Novgorod'],
      ['Екатеринбург', 'Yekaterinburg'],
      ['Хабаровск', 'Khabarovsk'],
      ['Дзержинск', 'Dzerzhinsk'],
      ['Теле2', 'Tele 2'],
    ]) {
      expect(foldName(a)).toBe(foldName(b));
    }
  });
});

describe('nameMatches', () => {
  it('matches a Latin needle against a Russian caption and vice versa', () => {
    expect(nameMatches('Россия, Казань', 'Kazan')).toBe(true);
    expect(nameMatches('Russia, Kazan # 2', 'казань')).toBe(true);
    expect(nameMatches('Россия, Красноярск #19', 'Krasnoyarsk')).toBe(true);
  });

  it('knows names that are not transliterations', () => {
    expect(nameMatches('Россия, Москва, ВАО', 'Moscow')).toBe(true);
    expect(nameMatches('Russia, Saint-Petersburg Center 2', 'Санкт-Петербург')).toBe(true);
    expect(nameMatches('Украина, Киев #17', 'Kyiv')).toBe(true);
    expect(nameMatches('Kyrgyzstan, Bishkek', 'Билайн')).toBe(false);
    expect(nameMatches('Билайн (KG)', 'beeline')).toBe(true);
  });

  it('matches the start of a word, not any substring', () => {
    expect(nameMatches('Ukraine, Kharkiv', 'Kyiv')).toBe(false);
    expect(nameMatches('Russia, Kazan', 'azan')).toBe(false);
    expect(nameMatches('megafone', 'megafon')).toBe(true);
    expect(nameMatches('megafone', 'Мегафон')).toBe(true);
  });
});
