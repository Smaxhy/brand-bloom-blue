/**
 * The Meta (Facebook) pixel for the public website.
 *
 * It runs on the public pages only: the homepage, the results page and the
 * privacy page. The admin area and the password-reset page are never tracked,
 * and their pages do not carry the pixel code at all.
 *
 * What it reports:
 *  - PageView on every public page (once per page, also when moving between
 *    pages without a full reload);
 *  - Lead when the quote request or the contact message is accepted
 *    (fired from src/inspirova.html, where those two forms live).
 *
 * To point the site at another pixel, change META_PIXEL_ID. Nothing else.
 */
export const META_PIXEL_ID = "826747246716805";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

const UNTRACKED = ["/admin", "/reset-password"];

/** True for the public pages. The admin area and password reset are left alone. */
export function isTrackedPath(pathname: string): boolean {
  return !UNTRACKED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Meta's standard base code, unchanged: it loads the pixel, starts it with our
 * ID and counts the page view. Running it a second time does nothing.
 */
export const META_PIXEL_BASE_CODE = `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');`;

/** The fallback image Meta asks for, for visitors with JavaScript switched off. */
export const META_PIXEL_NOSCRIPT_SRC = `https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`;

/**
 * Counts a page view after moving to another public page without a full reload.
 * (A full page load is counted by the base code in the page head.)
 */
export function trackPageView(pathname: string): void {
  if (typeof window === "undefined" || !isTrackedPath(pathname)) return;
  if (typeof window.fbq === "function") {
    window.fbq("track", "PageView");
    return;
  }
  // Arrived from a page that is not tracked (the admin area): start the pixel
  // now. Its base code counts this page view.
  const script = document.createElement("script");
  script.text = META_PIXEL_BASE_CODE;
  document.head.appendChild(script);
}
