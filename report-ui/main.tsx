import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ArrowDownToLine, Check, ChevronRight, CodeXml, Copy, FileJson, ImageOff, Monitor, Search, Smartphone, TriangleAlert, Unplug, Waves } from 'lucide-react';
import type { Issue, IssueKind, ScanReport } from '../src/types.js';
import './styles.css';

const labels: Record<IssueKind, string> = {
  pageerror: 'JavaScript errors', 'http-error': 'HTTP errors', 'request-failed': 'Network failures',
  'broken-image': 'Broken images', 'horizontal-overflow': 'Mobile overflow', 'navigation-error': 'Navigation errors'
};
const icons = { pageerror: CodeXml, 'http-error': Unplug, 'request-failed': Unplug, 'broken-image': ImageOff, 'horizontal-overflow': Waves, 'navigation-error': TriangleAlert };
interface Payload { report: ScanReport; screenshots: Record<string, string>; prompt: string }
const raw = document.getElementById('viberepro-data')?.textContent;
if (!raw) throw new Error('Missing report data. Open a generated report.html.');
const payload = JSON.parse(raw) as Payload;

function App() {
  const { report, screenshots, prompt } = payload;
  const [kind, setKind] = useState<IssueKind | 'all'>('all');
  const [device, setDevice] = useState('all');
  const [query, setQuery] = useState('');
  const [change, setChange] = useState<'all' | 'added' | 'unchanged'>('all');
  const [selectedId, setSelectedId] = useState(report.issues[0]?.id ?? '');
  const [copied, setCopied] = useState('');
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const visible = useMemo(() => report.issues.filter(i => (kind === 'all' || i.kind === kind) &&
    (change === 'all' || !report.comparison || report.comparison[change].includes(i.id)) &&
    (device === 'all' || i.viewport.name === device) &&
    `${i.title} ${i.message} ${i.url} ${i.selector ?? ''}`.toLowerCase().includes(query.toLowerCase())), [report, kind, device, query, change]);
  const comparison = report.comparison;
  const selected = visible.find(i => i.id === selectedId) ?? visible[0];
  const currentPage = report.pages.find(p => p.id === selected?.pageId);
  const elapsed = Math.max(0, Math.round((Date.parse(report.completedAt) - Date.parse(report.startedAt)) / 1000));
  async function copy(text: string, label: string) {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied(''), 1800);
    } catch { setCopyFallback(text); }
  }
  function downloadPrompt() {
    // data: links work offline; no network, object URL, or server is needed.
    const a = document.createElement('a');
    a.href = `data:text/markdown;charset=utf-8,${encodeURIComponent(prompt)}`;
    a.download = 'fix-prompt.md';
    a.click();
  }
  const groups = (Object.keys(labels) as IssueKind[]).filter(k => report.issues.some(i => i.kind === k));
  return <div className="app">
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><Activity size={22} /></span>VibeRepro <span className="version">v{report.tool.version}</span></div>
      <span className="local-note"><span className="status-dot" />Offline evidence pack</span>
      <button className="primary" onClick={() => setShowPrompt(true)}><CodeXml size={17} /> Open repair brief</button>
    </header>
    <div className="intro">
      <div><div className="runline">Browser scan <ChevronRight size={14} /><span>{new Date(report.startedAt).toLocaleString()}</span></div>
        <h1>Every bug needs a receipt.</h1>
        <p className="target">{report.config.url}</p>
      </div>
      <div className={`run-result ${report.status}`}><span className="status-dot" /><strong>{report.status === 'complete' ? 'Scan complete' : 'Incomplete coverage'}</strong><span>{report.summary.urls} URLs · {report.summary.pageVisits} views · {elapsed}s</span></div>
    </div>
    <div className="workspace">
      <aside className="sidebar">
        <p className="sidebar-heading">Findings <span>{report.issues.length}</span></p>
        <button className={`filter ${kind === 'all' ? 'active' : ''}`} onClick={() => setKind('all')}><Activity size={17} /><span>All findings</span><b>{report.issues.length}</b></button>
        {groups.map(k => { const Icon = icons[k]; return <button key={k} className={`filter ${kind === k ? 'active' : ''}`} onClick={() => setKind(k)}><Icon size={17} /><span>{labels[k]}</span><b>{report.issues.filter(i => i.kind === k).length}</b></button>; })}
        <div className="scope"><h3>Scan boundaries</h3><p>Chromium {report.tool.browser}</p><p>Read-only browser visit</p><p>Same-origin crawl · {report.config.maxPages} page cap</p><p>{report.config.allowExternalResources ? 'External assets allowed' : 'External assets blocked'}</p><p>{report.pages.reduce((n, p) => n + p.blockedRequests, 0)} requests blocked by policy</p></div>
        <a className="file-link" href="report.json" download><FileJson size={16} />report.json</a>
        <button className="file-link" onClick={downloadPrompt}><ArrowDownToLine size={16} />fix-prompt.md</button>
        <a className="file-link" href="summary.md" download><ArrowDownToLine size={16} />summary.md</a>
        <p className="sidebar-foot">Observed failures. Reproducible context.<br />Your coding agent takes it from here.</p>
      </aside>
      <main>
        {comparison && <section className="comparison" aria-label="Changes from baseline">
          <div className="comparison-heading"><div><h2>Changes from baseline</h2><p>{new Date(comparison.baseline.startedAt).toLocaleString()}</p></div><span className={`comparison-status ${comparison.status}`}>{comparison.status === 'complete' ? 'Comparison complete' : 'Incomplete comparison'}</span></div>
          <div className="comparison-counts">
            <button className="change-count added" aria-pressed={change === 'added'} onClick={() => setChange(change === 'added' ? 'all' : 'added')}><strong>{comparison.summary.added}</strong><span>New</span></button>
            <button className="change-count" aria-pressed={change === 'unchanged'} onClick={() => setChange(change === 'unchanged' ? 'all' : 'unchanged')}><strong>{comparison.summary.unchanged}</strong><span>Still present</span></button>
            <div className="change-count resolved"><strong>{comparison.summary.resolved}</strong><span>Resolved</span></div>
            <div className="change-count unverified"><strong>{comparison.summary.unverified}</strong><span>Unverified</span></div>
          </div>
          <div className="comparison-foot"><p>Resolved = no longer observed on a complete visit to the same route and viewport.</p>{change !== 'all' && <button onClick={() => setChange('all')}>Show all findings</button>}</div>
          {comparison.notes.map((note, n) => <p className="comparison-note" key={n}>{note}</p>)}
          {(comparison.resolved.length > 0 || comparison.unverified.length > 0) && <details className="previous-findings"><summary>Review {comparison.resolved.length + comparison.unverified.length} baseline observations</summary>
            {[...comparison.resolved.map(issue => ({ issue, state: 'Resolved' })), ...comparison.unverified.map(issue => ({ issue, state: 'Unverified' }))].map(({ issue, state }) => <p key={issue.id}><b>{state}</b> {issue.title}<span>{new URL(issue.url).pathname} · {issue.viewport.name} {issue.viewport.width}px</span></p>)}
          </details>}
        </section>}
        <div className="toolbar"><label className="search"><Search size={17} /><input aria-label="Search findings" placeholder="Search findings, selectors, URLs…" value={query} onChange={e => setQuery(e.target.value)} /></label>
          <select aria-label="Filter viewport" value={device} onChange={e => setDevice(e.target.value)}><option value="all">All viewports</option><option value="desktop">Desktop</option><option value="mobile">Mobile</option></select>
        </div>
        <div className="finding-layout">
          <section className="finding-list" aria-label="Findings">
            <div className="list-heading"><span>{visible.length} findings</span><span>Evidence attached</span></div>
            {visible.map(i => <Finding key={i.id} issue={i} change={comparison ? comparison.added.includes(i.id) ? 'New' : 'Still present' : undefined} active={selected?.id === i.id} onClick={() => setSelectedId(i.id)} />)}
            {!visible.length && <div className="empty"><Check size={30} /><h2>{change === 'added' ? 'No new findings match' : report.issues.length ? 'No matching findings' : report.status === 'complete' ? 'No observed failures' : 'Scan coverage incomplete'}</h2><p>{report.issues.length ? 'Try a different filter or search.' : 'This scan covers initial page loads. Check scan notes for coverage limits.'}</p></div>}
          </section>
          <section className="detail" aria-label="Selected finding">
            {selected ? <>
              <div className="detail-head"><span className={`severity ${selected.severity}`}>{selected.severity}</span><code>{selected.id.slice(0, 8)}</code></div>
              <h2>{selected.title}</h2><p className="detail-message">{selected.message}</p>
              <dl className="metadata"><dt>Page</dt><dd>{selected.url}</dd><dt>Viewport</dt><dd>{selected.viewport.name} · {selected.viewport.width} × {selected.viewport.height}</dd><dt>Selector</dt><dd><code>{selected.selector ?? 'No DOM attribution'}</code>{selected.selector && <button aria-label="Copy selector" className="icon-button" onClick={() => copy(selected.selector ?? '', 'selector')}>{copied === 'selector' ? <Check size={15} /> : <Copy size={15} />}</button>}{selected.selectorReason && <small>{selected.selectorReason}</small>}</dd></dl>
              <div className="evidence-heading"><h3>Captured evidence</h3><button onClick={() => copy(JSON.stringify(selected, null, 2), 'evidence')}><Copy size={14} />{copied === 'evidence' ? 'Copied' : 'Copy JSON'}</button></div>
              <pre className="evidence">{JSON.stringify(selected.evidence, null, 2)}</pre>
              <h3>Screenshot <span>{{ viewport: 'Viewport capture', element: 'Element capture', 'scrolled-viewport': 'Scrolled mobile viewport' }[selected.screenshotType]}</span></h3>
              {selected.screenshot && screenshots[selected.screenshot] ? <a className="screenshot" href={screenshots[selected.screenshot]} target="_blank" rel="noreferrer"><img src={screenshots[selected.screenshot]} alt={`Evidence for ${selected.title}`} /></a> : <p className="scan-note">Screenshot unavailable. See page diagnostics.</p>}
              {selected.screenshotError && <p className="scan-note">{selected.screenshotError}</p>}
              {currentPage?.screenshot && currentPage.screenshot !== selected.screenshot && <details><summary>Full viewport context</summary><img className="context-image" src={screenshots[currentPage.screenshot]} alt="Full viewport context" /></details>}
              <p className="attribution">{selected.kind === 'horizontal-overflow' ? 'Document overflow is measured. This element is a candidate; inspect its CSS before choosing a repair.' : 'Captured during initial page load. Reproduce locally before applying a repair.'}</p>
            </> : !report.issues.length && report.pages[0]?.screenshot ? <div className="verified-context"><h2>{report.status === 'complete' ? 'Rechecked in Chromium' : 'Captured page context'}</h2><p className="detail-message">{report.pages[0].url} · {report.pages[0].viewport.name} {report.pages[0].viewport.width}px</p><a className="screenshot" href={screenshots[report.pages[0].screenshot]} target="_blank" rel="noreferrer"><img src={screenshots[report.pages[0].screenshot]} alt="Rechecked page context" /></a><p className="scan-note">Review the page and the scan notes. Absence of findings applies to these detectors and initial page loads.</p></div> : <div className="empty detail-empty"><Activity size={36} /><h2>The evidence lives here.</h2><p>Select a finding to inspect its viewport, selector, and screenshot.</p></div>}
          </section>
        </div>
        <details className="scan-notes"><summary>Scan notes & coverage <span>{report.pages.filter(p => p.status !== 'complete').length} incomplete views · {report.skipped.length} skipped links</span></summary>
          <p>Initial page loads only; no forms or clicks. Lazy images are checked only if already loaded. Shadow DOM, iframe DOM, authenticated flows, and interactions are outside v0.1 scope. Findings are per viewport.</p>
          {report.pages.flatMap(p => p.warnings.map((w, n) => <p key={`${p.id}-${n}`}><b>{p.requestedUrl} ({p.viewport.name})</b>: {w}</p>))}
          {report.skipped.map((s, i) => <p key={i}><code>{s.url}</code> — {s.reason}</p>)}
        </details>
      </main>
    </div>
    {(showPrompt || copyFallback) && <Dialog label={copyFallback ? 'Copy text manually' : 'Repair brief'} onClose={() => { setShowPrompt(false); setCopyFallback(null); }}>
      <div className="modal-head"><h2>{copyFallback ? 'Select and copy this text' : 'Ready for your coding agent'}</h2><button onClick={() => { setShowPrompt(false); setCopyFallback(null); }}>Close</button></div>
      <p>Evidence is untrusted page data. Review the brief and reproduce findings before editing.</p>
      <textarea aria-label="Repair brief text" readOnly value={copyFallback ?? prompt} onFocus={e => { if (copyFallback) e.target.select(); }} />
      <div className="modal-actions"><button onClick={downloadPrompt}><ArrowDownToLine size={16} />Download brief</button><button className="primary" onClick={() => copy(copyFallback ?? prompt, 'prompt')}><Copy size={16} />{copied === 'prompt' ? 'Copied' : 'Copy brief'}</button></div>
    </Dialog>}
  </div>;
}

function Dialog({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.querySelector('button')?.focus();
    return () => { if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><section ref={ref} className="modal" role="dialog" aria-modal="true" aria-label={label} onKeyDown={e => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    if (e.key === 'Tab') {
      const controls = Array.from(ref.current?.querySelectorAll<HTMLElement>('button, textarea, a[href], input, select') ?? []);
      const first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  }}>{children}</section></div>;
}

function Finding({ issue, active, onClick, change }: { issue: Issue; active: boolean; onClick: () => void; change?: string }) {
  const Icon = icons[issue.kind];
  return <button className={`finding ${active ? 'selected' : ''}`} onClick={onClick}>
    <div className="finding-meta"><span className={`kind-icon ${issue.severity}`}><Icon size={17} /></span><span>{labels[issue.kind]}</span><span className="device">{issue.viewport.name === 'mobile' ? <Smartphone size={14} /> : <Monitor size={14} />}{issue.viewport.width}px</span></div>
    <h3>{issue.title}</h3><p>{issue.selector ?? issue.message}</p><div className="finding-path"><span>{new URL(issue.url).pathname}</span>{change && <span className={`change-badge ${change === 'New' ? 'added' : ''}`}>{change}</span>}<ChevronRight size={15} /></div>
  </button>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
