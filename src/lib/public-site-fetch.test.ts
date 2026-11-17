import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPublicJson, publicAddress, publicSiteUrl } from './public-site-fetch';

describe('website crawler destination safety', () => {
  it('blocks internal website addresses and credentials', () => {
    for (const url of ['http://127.0.0.1', 'http://10.0.0.1', 'http://169.254.169.254', 'http://2130706433', 'http://[::1]', 'http://service.internal', 'https://user:password@business.com', 'file:///etc/passwd']) {
      expect(publicSiteUrl(url)).toBeNull();
    }
  });
  it('allows ordinary public website URLs', () => {
    expect(publicSiteUrl('https://inspirovamarketing.com/contact')?.hostname).toBe('inspirovamarketing.com');
  });
  it('rejects private DNS answers', () => {
    for (const ip of ['172.16.0.1', '192.168.1.1', '100.64.0.1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) expect(publicAddress(ip)).toBe(false);
    expect(publicAddress('1.1.1.1')).toBe(true);
  });
});
describe('reading a public JSON file from a website', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** A network where every host resolves to `ip`, and pages answer from `pages`. */
  function network(pages: Record<string, () => Response>, ip = '93.184.216.34') {
    const asked: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.startsWith('https://cloudflare-dns.com/')) {
        const type = new URL(url).searchParams.get('type');
        return Response.json({ Status: 0, Answer: type === 'A' ? [{ type: 1, data: ip }] : [] });
      }
      asked.push(url);
      return pages[url]?.() ?? new Response('not found', { status: 404 });
    }));
    return asked;
  }
  const headers = { Accept: 'application/json' };

  it('returns the parsed file', async () => {
    const asked = network({ 'https://shop.com/meta.json': () => Response.json({ country: 'US', city: 'Austin' }) });
    expect(await fetchPublicJson('https://shop.com/meta.json', 2000, headers)).toEqual({ country: 'US', city: 'Austin' });
    expect(asked).toEqual(['https://shop.com/meta.json']);
  });

  it('follows a redirect only to another public destination', async () => {
    const asked = network({
      'https://shop.com/meta.json': () => new Response(null, { status: 301, headers: { location: 'https://www.shop.com/meta.json' } }),
      'https://www.shop.com/meta.json': () => Response.json({ country: 'US' }),
      'https://evil.com/meta.json': () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } }),
      'https://loop.com/meta.json': () => new Response(null, { status: 302, headers: { location: 'https://loop.com/meta.json' } }),
    });
    expect(await fetchPublicJson('https://shop.com/meta.json', 2000, headers)).toEqual({ country: 'US' });
    expect(await fetchPublicJson('https://evil.com/meta.json', 2000, headers)).toBeNull();
    expect(asked).not.toContain('http://169.254.169.254/latest/meta-data');
    // A redirect that never ends is given up on.
    expect(await fetchPublicJson('https://loop.com/meta.json', 2000, headers)).toBeNull();
    expect(asked.filter((u) => u === 'https://loop.com/meta.json')).toHaveLength(4);
  });

  it('never asks a host that resolves to a private address', async () => {
    const asked = network({ 'https://intranet.shop.com/meta.json': () => Response.json({ secret: true }) }, '10.0.0.5');
    expect(await fetchPublicJson('https://intranet.shop.com/meta.json', 2000, headers)).toBeNull();
    expect(await fetchPublicJson('http://127.0.0.1/meta.json', 2000, headers)).toBeNull();
    expect(await fetchPublicJson('https://service.internal/meta.json', 2000, headers)).toBeNull();
    expect(asked).toEqual([]);
  });

  it('is null for a page, a missing file, broken JSON and a file over the size limit', async () => {
    network({
      'https://shop.com/meta.json': () => new Response('<html>Password page</html>', { headers: { 'content-type': 'text/html' } }),
      'https://shop.com/broken.json': () => new Response('{"country":', { headers: { 'content-type': 'application/json' } }),
      'https://shop.com/products.json': () => Response.json({ products: 'x'.repeat(5000) }),
      'https://shop.com/small.json': () => Response.json({ products: 'x'.repeat(50) }),
    });
    expect(await fetchPublicJson('https://shop.com/meta.json', 2000, headers)).toBeNull();
    expect(await fetchPublicJson('https://shop.com/missing.json', 2000, headers)).toBeNull();
    expect(await fetchPublicJson('https://shop.com/broken.json', 2000, headers)).toBeNull();
    // Half a catalogue is not a catalogue: over the limit there is no answer at all.
    expect(await fetchPublicJson('https://shop.com/products.json', 2000, headers, 1000)).toBeNull();
    expect(await fetchPublicJson('https://shop.com/small.json', 2000, headers, 1000)).toEqual({ products: 'x'.repeat(50) });
  });
});
