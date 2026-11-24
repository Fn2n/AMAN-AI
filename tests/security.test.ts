import { describe, expect, it } from 'vitest';
import { isPublicIp, resolvePublic, safeFetch } from '@/lib/server/net';
import { parseAnalyzeRequest } from '@/lib/server/pipeline';

describe('SSRF protection', () => {
  it('blocks private, loopback, link-local, CGNAT, metadata and reserved addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1', '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '64:ff9b::a00:1', '2002:7f00:1::1', '2001:db8::1']) {
      expect(isPublicIp(ip), ip).toBe(false);
    }
  });
  it('allows public addresses', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) expect(isPublicIp(ip), ip).toBe(true);
  });
  it('refuses internal hostnames and literal private IPs before any connection', async () => {
    expect((await resolvePublic('localhost')).ok).toBe(false);
    expect((await resolvePublic('printer.local')).ok).toBe(false);
    expect((await safeFetch('http://127.0.0.1/admin')).blocked).toBeTruthy();
    expect((await safeFetch('http://169.254.169.254/latest/meta-data/')).blocked).toBeTruthy();
    expect((await safeFetch('http://[::1]/')).blocked).toBeTruthy();
  });
  it('refuses non-web schemes, custom ports and credentials in URLs', async () => {
    expect((await safeFetch('file:///etc/passwd')).blocked).toBeTruthy();
    expect((await safeFetch('http://example.com:8080/')).blocked).toMatch(/port/);
    expect((await safeFetch('http://user:pass@example.com/')).blocked).toMatch(/credentials/);
  });
});

describe('Analyze request validation', () => {
  it('accepts valid requests and applies size limits', () => {
    const r = parseAnalyzeRequest({ kind: 'url', text: 'https://example.com', options: { live: false } });
    expect(r?.options).toEqual({ live: false, research: true });
    expect(parseAnalyzeRequest({ kind: 'email', text: 'x'.repeat(50_000) })?.text?.length).toBe(10_000);
  });
  it('rejects unknown kinds and empty input', () => {
    expect(parseAnalyzeRequest({ kind: 'payment', text: 'x' })).toBeNull();
    expect(parseAnalyzeRequest({ kind: 'url', text: '   ' })).toBeNull();
    expect(parseAnalyzeRequest(null)).toBeNull();
    expect(parseAnalyzeRequest({ kind: 'social', social: { handle: '' } })).toBeNull();
  });
});
