/**
 * Small XSS-defence helpers. Use whenever user-authored text (email
 * templates, notes) is interpolated into HTML, URLs or preview strings.
 *
 * We deliberately do NOT ship a full DOM sanitiser — the app renders user
 * text as plain JSX text (React escapes automatically). These helpers cover
 * the few places where raw strings can slip into an unsafe sink: `href`
 * attributes, window.open URLs, and any future `dangerouslySetInnerHTML`
 * we would rather forbid.
 */

const DANGEROUS_URL_SCHEME = /^\s*(javascript|data|vbscript|file):/i;

/**
 * Return a value safe to drop into an `href`/`src` attribute. Anything
 * using a dangerous scheme (`javascript:`, `data:`, `vbscript:`) is replaced
 * with `#`. Relative and http(s)/mailto/tel URLs pass through.
 */
export function safeUrl(raw: string | undefined | null): string {
  if (!raw) return "#";
  const trimmed = String(raw).trim();
  if (!trimmed) return "#";
  if (DANGEROUS_URL_SCHEME.test(trimmed)) return "#";
  return trimmed;
}

/**
 * Strip anything that looks like an HTML tag, script content or inline event
 * handler from a plain-text string. Intended for defence-in-depth when
 * building preview strings that get concatenated into innerText.
 */
export function stripTags(raw: string | undefined | null): string {
  if (!raw) return "";
  return String(raw)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

/**
 * Cheap length cap so pasted "War and Peace" content can't blow up the UI
 * or downstream API payloads. Silently truncates.
 */
export function clampText(raw: string | undefined | null, max = 5000): string {
  const s = raw ?? "";
  return s.length > max ? s.slice(0, max) : s;
}
