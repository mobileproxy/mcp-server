/** Backend DATETIME "YYYY-MM-DD HH:MM:SS" is Moscow time (UTC+3, no DST) → epoch ms, NaN if unparseable. */
export function parseMskDateTime(s: string): number {
  return Date.parse(s.replace(' ', 'T') + '+03:00');
}
