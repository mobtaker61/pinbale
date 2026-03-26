type CounterKey = string;
const counters = new Map<CounterKey, number>();

export function incrementMetric(name: string, labels: Record<string, string> = {}): void {
  const key = `${name}:${Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(',')}`;
  counters.set(key, (counters.get(key) ?? 0) + 1);
}

export function getMetricsSnapshot() {
  return Array.from(counters.entries()).map(([key, value]) => ({ key, value }));
}
