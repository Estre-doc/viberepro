export type IssueKind = 'pageerror' | 'http-error' | 'request-failed' | 'broken-image' | 'horizontal-overflow' | 'navigation-error';
export interface Viewport { name: 'desktop' | 'mobile'; width: number; height: number }
export interface ScanOptions {
  url: string;
  outDir?: string;
  maxPages?: number;
  concurrency?: number;
  timeoutMs?: number;
  settleMs?: number;
  viewport?: 'both' | 'desktop' | 'mobile';
  allowPublic?: boolean;
  allowExternalResources?: boolean;
  browserExecutable?: string;
  baseline?: string;
}
export interface ScanConfig {
  url: string;
  origin: string;
  maxPages: number;
  concurrency: number;
  timeoutMs: number;
  settleMs: number;
  viewports: Viewport[];
  allowPublic: boolean;
  allowExternalResources: boolean;
}
export interface Issue {
  id: string;
  pageId: string;
  kind: IssueKind;
  severity: 'error' | 'warning';
  title: string;
  message: string;
  url: string;
  viewport: Viewport;
  selector: string | null;
  selectorReason?: string;
  evidence: Record<string, string | number | boolean | null>;
  screenshot: string | null;
  screenshotType: 'viewport' | 'element' | 'scrolled-viewport';
  screenshotError?: string;
}
export interface PageResult {
  id: string;
  requestedUrl: string;
  url: string;
  title: string;
  viewport: Viewport;
  status: 'complete' | 'partial' | 'failed';
  httpStatus: number | null;
  durationMs: number;
  screenshot: string | null;
  warnings: string[];
  blockedRequests: number;
}
export interface ScanReport {
  schemaVersion: '1.0';
  tool: { name: 'VibeRepro'; version: string; browser: string };
  startedAt: string;
  completedAt: string;
  status: 'complete' | 'partial';
  config: ScanConfig;
  summary: { urls: number; pageVisits: number; issues: number; errors: number; warnings: number };
  pages: PageResult[];
  issues: Issue[];
  skipped: { url: string; reason: string }[];
  comparison?: ReportComparison;
}
export interface ReportComparison {
  schemaVersion: '1.0';
  baseline: { url: string; startedAt: string; status: ScanReport['status'] };
  status: 'complete' | 'partial';
  summary: { added: number; unchanged: number; resolved: number; unverified: number };
  added: string[];
  unchanged: string[];
  resolved: Issue[];
  unverified: Issue[];
  notes: string[];
}
export type IssueDraft = Pick<Issue, 'kind' | 'severity' | 'title' | 'message' | 'selector' | 'selectorReason' | 'evidence'>;
