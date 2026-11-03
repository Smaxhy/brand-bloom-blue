import { describe, expect, it } from 'vitest';
import { publicAddress, publicSiteUrl } from './public-site-fetch';

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