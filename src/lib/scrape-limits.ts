/**
 * Most businesses/contacts one scrape can return, keep after saving, and send
 * to a reveal scan. Shared by the browser and the server so no step silently
 * trims a bigger scrape (it used to be 500 in some places and 1,000 in others).
 */
export const MAX_SCRAPE_RESULTS = 2000;
