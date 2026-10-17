import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crawlCandidate, normalizeUrl, requestPolicy, resolveConfig } from '../src/policy.js';
import { safeJson } from '../src/report.js';

test('permission, protocol, credentials, bounds, and sensitive seed checks', () => {
  assert.throws(() => resolveConfig({ url: 'https://example.com' }), /allow-public/);
  assert.equal(resolveConfig({ url: 'https://example.com', allowPublic: true }).maxPages, 5);
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'https://u:p@example.com', 'http://localhost/logout']) assert.throws(() => resolveConfig({ url, allowPublic: true }));
  for (const maxPages of [0, 51, 1.2, NaN, Infinity]) assert.throws(() => resolveConfig({ url: 'http://localhost', maxPages }));
  assert.throws(() => resolveConfig({ url: 'http://localhost', concurrency: 9 }));
  assert.throws(() => resolveConfig({ url: 'http://localhost', settleMs: -1 }));
  assert.equal(normalizeUrl('http://localhost:3000/a#b').href, 'http://localhost:3000/a');
});
test('same-origin crawl deduplicates fragments and excludes actions, queries and assets', () => {
  const config = resolveConfig({ url: 'http://localhost:3000' });
  assert.equal(crawlCandidate('/a#b', config).url, 'http://localhost:3000/a');
  for (const u of ['http://localhost:3001/a', '/logout', '/%64elete', '/a?token=secret', '/archive.zip', 'mailto:a@b.com']) assert.ok(crawlCandidate(u, config).reason, u);
});
test('request guard blocks writes and outside navigation; assets need explicit opt-in', () => {
  const config = resolveConfig({ url: 'http://localhost:3000' });
  assert.equal(requestPolicy('http://localhost:3000/a', 'GET', true, config), null);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.ok(requestPolicy(config.url, method, false, config));
  assert.ok(requestPolicy('https://outside.test/a.js', 'GET', false, config));
  const external = { ...config, allowExternalResources: true };
  assert.equal(requestPolicy('https://outside.test/a.js', 'GET', false, external), null);
  assert.ok(requestPolicy('https://outside.test/', 'GET', true, external));
});
test('embedded JSON cannot terminate its script element', () => {
  const value = '</script><img src=x onerror=alert(1)>\u2028&';
  const json = safeJson({ value });
  assert.ok(!json.includes('<'));
  assert.deepEqual(JSON.parse(json), { value });
});
