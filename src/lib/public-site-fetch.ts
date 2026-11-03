/** Crawl only public website destinations; recheck every redirect. */
export function publicSiteUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    if (url.port && !['80', '443'].includes(url.port)) return null;
    const host = url.hostname.toLowerCase();
    if (!host.includes('.') || host.endsWith('.') || /[:\[\]]/.test(host)) return null;
    if (/\.(localhost|local|internal|test|invalid|example)$/.test(host)) return null;
    if (/^[\d.]+$/.test(host) && !publicAddress(host)) return null;
    return url;
  } catch { return null; }
}

export function publicAddress(ip: string): boolean {
  if (ip.includes(':')) return /^[23][0-9a-f]{3}:/i.test(ip) && !/^2001:(?:db8|0{0,3}[012]):/i.test(ip);
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b, c] = parts;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}

async function publicHost(host: string, signal: AbortSignal): Promise<boolean> {
  if (/^[\d.]+$/.test(host)) return publicAddress(host);
  const records = await Promise.all(['A', 'AAAA'].map(async (type) => {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, {
      headers: { Accept: 'application/dns-json' }, signal,
    });
    if (!res.ok) throw new Error('Website destination could not be verified.');
    const data = await res.json() as { Status?: number; Answer?: { type: number; data: string }[] };
    if (data.Status !== 0) throw new Error('Website destination could not be verified.');
    return (data.Answer ?? []).filter((a) => a.type === 1 || a.type === 28).map((a) => a.data);
  }));
  const addresses = records.flat();
  return addresses.length > 0 && addresses.every(publicAddress);
}

export async function fetchPublicSite(value: string, timeoutMs: number, headers: HeadersInit): Promise<{ html: string; finalUrl: string } | null> {
  const signal = AbortSignal.timeout(timeoutMs);
  let destination = value;
  for (let hop = 0; hop < 5; hop++) {
    const url = publicSiteUrl(destination);
    if (!url || !(await publicHost(url.hostname, signal))) return null;
    const res = await fetch(url, { headers, redirect: 'manual', signal });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      await res.body?.cancel();
      const location = res.headers.get('location');
      if (!location) return null;
      destination = new URL(location, url).href;
      continue;
    }
    if (!res.ok || !/html|xml|text/i.test(res.headers.get('content-type') ?? 'text/html')) {
      await res.body?.cancel();
      return null;
    }
    const reader = res.body?.getReader();
    if (!reader) return null;
    const decoder = new TextDecoder();
    let html = '', size = 0;
    try {
      while (size < 250000) {
        const chunk = await reader.read();
        if (chunk.done) break;
        const bytes = chunk.value.slice(0, 250000 - size);
        size += bytes.length;
        html += decoder.decode(bytes, { stream: true });
      }
      html += decoder.decode();
    } finally { await reader.cancel(); }
    return { html, finalUrl: url.href };
  }
  return null;
}