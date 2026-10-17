import { mkdir, writeFile } from 'node:fs/promises';

const checks = await Promise.all([
  ['npm', 'https://registry.npmjs.org/viberepro'],
  ['github', 'https://api.github.com/search/repositories?q=VibeRepro+in:name']
].map(async ([service, url]) => {
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'VibeRepro-name-check', accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    return service === 'npm' ? { service, url, status: response.status, result: response.status === 404 ? 'No registry entry; availability must be confirmed at publish time' : response.ok ? 'Name is already registered' : 'Unverified' }
      : { service, url, status: response.status, totalCount: data.total_count ?? null, repositories: data.items?.map(item => item.full_name) ?? [], result: response.ok ? 'Search only; GitHub names are owner-scoped, owner not selected' : 'Unverified' };
  } catch (error) { return { service, url, result: 'Unverified', error: error.message }; }
}));
const result = { checkedAt: new Date().toISOString(), checks, trademark: 'Not checked. Search is not a trademark clearance or a reservation.' };
await mkdir('docs', { recursive: true });
await writeFile('docs/NAME_CHECK.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
