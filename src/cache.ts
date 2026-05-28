interface Entry<V> {
  value: V;
  expiresAt: number; /* epoch ms; 0 = never */
}

export class TtlCache<K, V> {
  private store = new Map<K, Entry<V>>();

  constructor(private defaultTtlMs: number) {}

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V, ttlMs?: number): void {
    const ttl = ttlMs ?? this.defaultTtlMs;
    this.store.set(key, {
      value,
      expiresAt: ttl > 0 ? Date.now() + ttl : 0,
    });
  }

  delete(key: K): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}
