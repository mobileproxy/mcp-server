/** ipguardian.net sources ({maintainer, category, filename, ...}) → short unique labels like "FireHOL (abuse)". */
export function listedBy(sources: unknown[]): string[] {
  const labels = new Set<string>();
  for (const s of sources) {
    if (s && typeof s === 'object') {
      const o = s as { maintainer?: string; category?: string; filename?: string };
      const name = o.maintainer ?? o.filename ?? JSON.stringify(s);
      labels.add(o.category ? `${name} (${o.category})` : name);
    } else {
      labels.add(String(s));
    }
  }
  return [...labels];
}
