import type { Page } from 'playwright';

export async function inspectDom(page: Page, mobile: boolean, blockedUrls: string[]) {
  return page.evaluate(({ mobile, blockedUrls }) => {
    function selector(el: Element): string {
      if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) return `#${CSS.escape(el.id)}`;
      const parts: string[] = [];
      let node: Element | null = el;
      while (node && node !== document.documentElement) {
        const tag = node.tagName.toLowerCase();
        const parent: Element | null = node.parentElement;
        const siblings = parent ? [...parent.children].filter(s => s.tagName === node?.tagName) : [];
        parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(node) + 1})`);
        node = parent;
      }
      return parts.length ? `html > ${parts.join(' > ')}` : 'html';
    }
    const blocked = new Set(blockedUrls);
    const resources = [...document.querySelectorAll('img,script[src],link[href],iframe[src],video[src],audio[src],source[src]')]
      .slice(0, 10000).map(el => ({
        url: el instanceof HTMLImageElement ? el.currentSrc || el.src : new URL(el.getAttribute('src') || el.getAttribute('href') || '', document.baseURI).href,
        selector: selector(el)
      }));
    const imageCandidates = [...document.images].slice(0, 10000).filter(img => {
      const rect = img.getBoundingClientRect();
      const style = getComputedStyle(img);
      return img.complete && img.naturalWidth === 0 && Boolean(img.currentSrc || img.getAttribute('src')) &&
        !blocked.has(img.currentSrc || img.src) && rect.width > 0 && rect.height > 0 &&
        style.display !== 'none' && style.visibility !== 'hidden';
    });
    const images = imageCandidates.slice(0, 30).map(img => ({ selector: selector(img), src: img.currentSrc || img.src, alt: img.alt.slice(0, 300), naturalWidth: img.naturalWidth }));
    const root = document.documentElement;
    const width = root.clientWidth;
    const scrollWidth = Math.max(root.scrollWidth, document.body?.scrollWidth ?? 0);
    const overflow = mobile && scrollWidth > width + 2
      ? [...document.querySelectorAll('body *')].slice(0, 10000).filter(el => {
        if (!(el instanceof HTMLElement)) return false;
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        if (r.width <= 0 || r.height <= 0 || s.visibility === 'hidden' || s.display === 'none' || s.position === 'fixed') return false;
        if (r.right <= width + 2 && r.left >= -2) return false;
        // Ignore children that correctly live inside a clipped/scrollable container.
        let p = el.parentElement;
        while (p && p !== document.body && p !== root) {
          if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(p).overflowX)) return false;
          p = p.parentElement;
        }
        return true;
      }).slice(0, 10).map(el => {
        const r = el.getBoundingClientRect();
        return { selector: selector(el), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
      }) : [];
    if (mobile && scrollWidth > width + 2 && overflow.length === 0) {
      overflow.push({ selector: 'html', left: 0, right: scrollWidth, width: scrollWidth });
    }
    return {
      images, overflow, resources, width, scrollWidth,
      links: [...document.querySelectorAll<HTMLAnchorElement>('a[href]')].slice(0, 1000).map(a => a.href),
      truncated: document.querySelectorAll('body *').length > 10000 || document.images.length > 10000 || imageCandidates.length > 30
    };
  }, { mobile, blockedUrls });
}
