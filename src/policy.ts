import { isIP } from 'node:net';
import type { ScanConfig, ScanOptions, Viewport } from './types.js';

export const VIEWPORTS: Viewport[] = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 }
];
const sensitivePath = /(?:^|\/)(?:logout|log-out|signout|sign-out|delete|remove|destroy|unsubscribe|checkout|payment|billing|admin|login|signin|sign-in|register)(?:\/|$|[._-])/i;
const binaryPath = /\.(?:pdf|zip|gz|tar|exe|dmg|png|jpe?g|gif|svg|webp|ico|mp[34]|webm|woff2?|css|js|json|xml|txt)$/i;

export function isLoopback(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  return h === 'localhost' || h === '::1' || (isIP(h) === 4 && h.startsWith('127.'));
}
function bounded(value: number | undefined, fallback: number, max: number, name: string, min = 1): number {
  const n = value ?? fallback;
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  return n;
}
export function normalizeUrl(input: string): URL {
  let u: URL;
  try { u = new URL(input); } catch { throw new Error('Provide a full http:// or https:// URL.'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only HTTP(S) pages are supported.');
  if (u.username || u.password) throw new Error('URLs containing credentials are not supported.');
  u.hash = '';
  return u;
}
export function resolveConfig(options: ScanOptions): ScanConfig {
  const u = normalizeUrl(options.url);
  if (!isLoopback(u.hostname) && !options.allowPublic) {
    throw new Error('Non-loopback targets require --allow-public to confirm you have permission to scan this origin.');
  }
  if (sensitivePath.test(decodeURIComponent(u.pathname))) throw new Error('Login, administrative, and potentially destructive paths are excluded.');
  if (options.viewport && !['both', 'desktop', 'mobile'].includes(options.viewport)) throw new Error('viewport must be both, desktop, or mobile.');
  return {
    url: u.href, origin: u.origin,
    maxPages: bounded(options.maxPages, 5, 50, 'max-pages'),
    concurrency: bounded(options.concurrency, 2, 8, 'concurrency'),
    timeoutMs: bounded(options.timeoutMs, 15000, 60000, 'timeout', 100),
    settleMs: bounded(options.settleMs, 1000, 10000, 'settle', 0),
    viewports: VIEWPORTS.filter(v => !options.viewport || options.viewport === 'both' || v.name === options.viewport).map(v => ({ ...v })),
    allowPublic: options.allowPublic ?? false,
    allowExternalResources: options.allowExternalResources ?? false
  };
}
export function crawlCandidate(href: string, config: ScanConfig): { url: string; reason?: string } {
  try {
    const u = normalizeUrl(new URL(href, config.url).href);
    if (u.origin !== config.origin) return { url: u.href, reason: 'Different origin' };
    if (u.search) return { url: u.href, reason: 'Query links are not crawled' };
    if (sensitivePath.test(decodeURIComponent(u.pathname))) return { url: u.href, reason: 'Excluded sensitive path' };
    if (binaryPath.test(u.pathname)) return { url: u.href, reason: 'Non-page asset' };
    return { url: u.href };
  } catch { return { url: href.slice(0, 1000), reason: 'Unsupported or invalid URL' }; }
}
export function requestPolicy(url: string, method: string, navigation: boolean, config: ScanConfig): string | null {
  if (!['GET', 'HEAD'].includes(method)) return `Blocked ${method} request`;
  try {
    const u = new URL(url);
    if (['data:', 'blob:', 'about:'].includes(u.protocol)) return null;
    if (!['http:', 'https:'].includes(u.protocol)) return 'Unsupported request protocol';
    if (u.username || u.password) return 'Credentials in URL';
    if (sensitivePath.test(decodeURIComponent(u.pathname))) return 'Excluded sensitive path';
    if (u.origin !== config.origin && (navigation || !config.allowExternalResources)) return 'Different origin';
    return null;
  } catch { return 'Invalid request URL'; }
}
