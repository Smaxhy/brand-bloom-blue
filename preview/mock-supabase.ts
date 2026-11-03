/* Preview-only fake of the Supabase client: fake login, in-memory tables. */
const user = { id: "u_preview", email: "sam@inspirova.local" };
const session = { access_token: "preview", user };
const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

const mailboxes = [
  { id: "mb1", email: "sam@getinspirova.com", display_name: "Sam Peeters", status: "active", daily_cap: 30, timezone: "America/Denver", window_start: 8, window_end: 17, send_days: [1,2,3,4,5], signature: "Sam Peeters\nInspirova Marketing · +32 470 00 00 00", last_error: null, last_sync_at: iso(6*60e3), created_at: iso(12*86400e3) },
  { id: "mb2", email: "lena@getinspirova.com", display_name: "Lena Jacobs", status: "active", daily_cap: 20, timezone: "Europe/Brussels", window_start: 9, window_end: 18, send_days: [1,2,3,4,5], signature: "", last_error: null, last_sync_at: iso(9*60e3), created_at: iso(5*86400e3) },
];
const leads = [
  { id: "l1", company: "Summit Roofing Co", domain: "summitroofingco.com", website: "summitroofingco.com", contact_name: "Marcus Delgado", contact_title: "Owner", email: "marcus@summitroofingco.com", email_source: "Website", email_guessed: false, email_verified: "mx_ok", phone: "(303) 555-0142", linkedin: "", city: "Littleton", region: "US", industry: "Roofing", status: "accepted" },
  { id: "l2", company: "Pine Valley Dental", domain: "pinevalleydental.com", website: "pinevalleydental.com", contact_name: "Dr. Hannah Lee", contact_title: "Owner", email: "hannah@pinevalleydental.com", email_source: "Guess", email_guessed: true, email_verified: "mx_ok", phone: "", linkedin: "", city: "Highlands Ranch", region: "US", industry: "Dentist", status: "accepted" },
  { id: "l3", company: "Boomverzorging De Wilde", domain: "dewildebomen.be", website: "dewildebomen.be", contact_name: "", contact_title: "", email: "info@dewildebomen.be", email_source: "Website", email_guessed: false, email_verified: "mx_ok", phone: "", linkedin: "", city: "Antwerpen", region: "EU", industry: "Tree care", status: "accepted" },
  { id: "l4", company: "Front Range HVAC", domain: "frontrangehvac.com", website: "frontrangehvac.com", contact_name: "Tony Ruiz", contact_title: "President", email: "tony@frontrangehvac.com", email_source: "Website", email_guessed: false, email_verified: "valid", phone: "", linkedin: "", city: "Centennial", region: "US", industry: "HVAC", status: "accepted" },
];
const sequences = [
  { id: "sq1", name: "Roofers · Denver South · Nov", status: "active", mailbox_ids: ["mb1"], stop_on_reply: true, gap_min_sec: 45, gap_max_sec: 180, created_at: iso(4*86400e3), updated_at: iso(86400e3) },
  { id: "sq2", name: "Boomverzorgers · Antwerpen", status: "draft", mailbox_ids: ["mb2"], stop_on_reply: true, gap_min_sec: 60, gap_max_sec: 240, created_at: iso(2*86400e3), updated_at: iso(2*86400e3) },
];
const sequence_steps = [
  { id: "st1", sequence_id: "sq1", position: 0, delay_days: 0, subject: "{{company}} — quick idea", subject_b: "two ideas for {{company}}", body: "Hi {{first_name}},\n\nI came across {{company}} while looking at roofing companies in {{city}} and had two ideas for getting more re-roof jobs before the snow.\n\nWorth a 10-minute call this week?" },
  { id: "st2", sequence_id: "sq1", position: 1, delay_days: 3, subject: "", body: "Hi {{first_name}}, bumping this in case it got buried." },
  { id: "st3", sequence_id: "sq1", position: 2, delay_days: 5, subject: "", body: "Last note from me, {{first_name}} — if growing {{company}} isn't a priority right now, no problem at all." },
];
const enrollments = [
  { id: "e1", sequence_id: "sq1", lead_id: "l1", mailbox_id: "mb1", status: "replied", current_step: 2, variant: "A", next_send_at: iso(-3*86400e3), thread_id: "t1", last_error: null, replied_at: iso(3*3600e3), completed_at: null, created_at: iso(4*86400e3), updated_at: iso(3*3600e3) },
  { id: "e2", sequence_id: "sq1", lead_id: "l2", mailbox_id: "mb1", status: "active", current_step: 1, variant: "B", next_send_at: iso(-2*86400e3), thread_id: "t2", last_error: null, replied_at: null, completed_at: null, created_at: iso(3*86400e3), updated_at: iso(86400e3) },
  { id: "e3", sequence_id: "sq1", lead_id: "l4", mailbox_id: null, status: "queued", current_step: 0, next_send_at: iso(-40*60e3), thread_id: null, last_error: null, replied_at: null, completed_at: null, created_at: iso(3600e3), updated_at: iso(3600e3) },
  { id: "e4", sequence_id: "sq2", lead_id: "l3", mailbox_id: "mb2", status: "queued", current_step: 0, next_send_at: iso(-86400e3), thread_id: null, last_error: null, replied_at: null, completed_at: null, created_at: iso(2*3600e3), updated_at: iso(2*3600e3) },
];
const messages: any[] = [];
for (let d = 13; d >= 0; d--) { const n = d % 7 === 0 || d % 7 === 6 ? 0 : 12 + ((d * 7) % 11); for (let i = 0; i < n; i++) messages.push({ id: `m${d}_${i}`, enrollment_id: "e2", lead_id: "l2", mailbox_id: "mb1", direction: "out", step_position: 0, gmail_thread_id: "t2", subject: "Quick idea", snippet: "", kind: "email", status: "sent", error: null, sent_at: new Date(now - d * 86400e3 - i * 600e3).toISOString() }); }
messages.push({ id: "r1", enrollment_id: "e1", lead_id: "l1", mailbox_id: "mb1", direction: "in", step_position: null, gmail_thread_id: "t1", subject: "Re: Summit Roofing Co — quick idea", snippet: "Sure, Thursday afternoon works. What's the pricing like for a basic site plus ads?", body_text: "Sure, Thursday afternoon works. What's the pricing like for a basic site plus ads?\n\nWe're slammed until the end of the month but want to be ready for spring.\n\nMike", intent: "interested", draft_reply: "Thanks Mike — Thursday works. I can do 14:00 or 16:00, whichever is easier.\n\nPricing depends on scope: a site that's built to book estimates is one number, ads on top is another. Ten minutes on the phone and I can give you a straight figure for both.\n\nWhich slot suits?", handled_at: null, from_header: "Mike Torres <mike@summitroofingco.com>", kind: "reply", status: "received", error: null, sent_at: iso(3*3600e3) });
messages.push({ id: "r4", enrollment_id: "e4", lead_id: "l3", mailbox_id: "mb2", direction: "in", step_position: null, gmail_thread_id: "t4", subject: "Re: Vandenberg Plumbing — quick idea", snippet: "Not a priority before January, check back then.", body_text: "Not a priority before January, check back then.\n\nSofie", intent: "later", draft_reply: "Understood, Sofie — I'll leave you be until January and check back in then. If anything changes before that, just reply here.", handled_at: null, from_header: "Sofie Vandenberg <sofie@vandenbergplumbing.be>", kind: "reply", status: "received", error: null, sent_at: iso(9*3600e3) });
messages.push({ id: "r5", enrollment_id: "e2", lead_id: "l2", mailbox_id: "mb1", direction: "in", step_position: null, gmail_thread_id: "t2", subject: "Re: Pine Valley Dental — quick idea", snippet: "Do you also handle Google reviews? Ours are a mess.", body_text: "Do you also handle Google reviews? Ours are a mess.", intent: "question", draft_reply: "We do — review flow is usually the first thing we fix because it moves the map ranking fastest. Happy to show you what that looks like for Pine Valley on a 10-minute call this week; Tuesday or Wednesday morning?", handled_at: iso(20*3600e3), from_header: "Dr. Chen <drchen@pinevalleydental.com>", kind: "reply", status: "received", error: null, sent_at: iso(22*3600e3) });
messages.push({ id: "r2", enrollment_id: null, lead_id: null, mailbox_id: "mb1", direction: "in", step_position: null, gmail_thread_id: "t9", subject: "Delivery Status Notification (Failure)", snippet: "Address not found: office@oldroofers.com", kind: "bounce", status: "received", error: null, sent_at: iso(26*3600e3) });
messages.push({ id: "r3", enrollment_id: "e2", lead_id: "l2", mailbox_id: "mb1", direction: "in", step_position: null, gmail_thread_id: "t2", subject: "Automatic reply: Pine Valley Dental", snippet: "I am out of the office until Monday.", kind: "auto_reply", status: "received", error: null, sent_at: iso(30*3600e3) });
const suppressions = [
  { id: "s1", email: "office@oldroofers.com", domain: "oldroofers.com", reason: "bounce", note: "Delivery Status Notification (Failure)", created_at: iso(26*3600e3) },
  { id: "s2", email: "jan@dakwerkenjan.be", domain: "dakwerkenjan.be", reason: "unsubscribe", note: "link", created_at: iso(2*86400e3) },
];
const outreach_settings = [{ id: "singleton", company_name: "Inspirova Marketing", postal_address: "Meir 88, 2000 Antwerpen, Belgium", website: "inspirovamarketing.com", eu_notice: "You are receiving this because your company is publicly listed as a local business and we believe our services may be relevant to it. Reply with \"unsubscribe\" or use the link below and we will not contact you again.", us_notice: "You are receiving this one-time business message because your company is publicly listed. Use the link below to opt out at any time." }];
const saved_searches: any[] = [
  { id: "ss1", name: "Roofers · Denver", location: "Denver, CO", industry: "roofing", per_page: 50, providers: ["places","serper","osm"], geo: null, region: "US", min_score: 55, auto_enroll_sequence_id: "sq1", schedule: "weekly", next_run_at: iso(-5*86400e3), last_run_at: iso(2*86400e3), last_result: { found: 48, new: 11, with_email: 7, enrolled: 4 }, created_at: iso(9*86400e3) },
  { id: "ss2", name: "Tandartsen · Antwerpen", location: "Antwerpen, België", industry: "tandarts", per_page: 25, providers: ["places","osm"], geo: null, region: "EU", min_score: 60, auto_enroll_sequence_id: null, schedule: "daily", next_run_at: iso(-14*3600e3), last_run_at: iso(10*3600e3), last_result: { found: 25, new: 3, with_email: 2, enrolled: 0 }, created_at: iso(4*86400e3) },
];
const search_seen: any[] = [];
const tables: Record<string, any[]> = { mailboxes, leads, sequences, sequence_steps, enrollments, messages, suppressions, outreach_settings, saved_searches, search_seen, user_roles: [{ user_id: user.id, role: "admin" }], admin_state: [] };
const rel: Record<string, Record<string, [string, string, string]>> = { enrollments: { leads: ["leads", "lead_id", "id"], sequences: ["sequences", "sequence_id", "id"], mailboxes: ["mailboxes", "mailbox_id", "id"] }, messages: { leads: ["leads", "lead_id", "id"], mailboxes: ["mailboxes", "mailbox_id", "id"] } };

function query(table: string) {
  let rows = [...(tables[table] ?? [])];
  const filters: ((r: any) => boolean)[] = [];
  let order: { col: string; asc: boolean } | null = null;
  let lim = Infinity;
  let select = "*";
  const thenable = (fn: () => any) => ({ then(resolve: any) { resolve(fn()); } });
  const api: any = {
    select(s = "*") { select = s; return Object.assign(Object.create(api), { then: api.then }); },
    eq(c: string, v: any) { filters.push((r) => r[c] === v); return api; },
    neq(c: string, v: any) { filters.push((r) => r[c] !== v); return api; },
    gte(c: string, v: any) { filters.push((r) => r[c] >= v); return api; },
    order(c: string, o?: { ascending?: boolean }) { order = { col: c, asc: o?.ascending !== false }; return api; },
    limit(n: number) { lim = n; return api; },
    maybeSingle() {
      if (table === "admin_state") return Promise.resolve({ data: { data: { raw: [
        { id: "r1", business: "Summit Roofing Co", email: "marcus@summitroofingco.com", phone: "(303) 555-0142", website: "summitroofingco.com", city: "Littleton", industry: "Roofing", status: "raw", scrapedAt: now, contactName: "Marcus Delgado", contactTitle: "Owner", source: "Google+Claude", emailSource: "Website", rating: 4.8, reviews: 212, score: 82, scoreWhy: ["Published email on the site (+25)", "Owner named (+10)", "Domain accepts mail (+10)", "212 reviews, 4.8★ (+15)", "No Meta pixel, no booking (+22)"] },
        { id: "r2", business: "Pine Valley Dental", email: "hannah@pinevalleydental.com", phone: "", website: "pinevalleydental.com", city: "Highlands Ranch", industry: "Dentist", status: "raw", scrapedAt: now, contactName: "Dr. Hannah Lee", source: "Google", emailSource: "Guess", rating: 4.2, reviews: 38, score: 51, scoreWhy: ["Guessed pattern (+8)", "Domain accepts mail (+10)", "38 reviews (+8)", "Site builder: Wix, copyright 2019 (+25)"] },
        { id: "r3", business: "Ken Caryl Landscaping", email: "info@kencaryllandscaping.com", phone: "(720) 555-0188", website: "kencaryllandscaping.com", city: "Littleton", industry: "Landscaping", status: "raw", scrapedAt: now, source: "Google+OSM", emailSource: "Website", rating: 4.9, reviews: 64, score: 68, scoreWhy: ["Published email on the site (+25)", "Domain accepts mail (+10)", "64 reviews, 4.9★ (+12)", "Has Google Ads, no booking (+21)"] },
        { id: "r4", business: "Dakwerken Peeters", email: "info@dakwerkenpeeters.be", phone: "+32 3 555 01 23", website: "dakwerkenpeeters.be", city: "Antwerpen", industry: "Roofing", status: "raw", scrapedAt: now, source: "Website" },
      ] } }, error: null });
      return Promise.resolve({ data: null, error: null });
    },
    insert(v: any) { const arr = Array.isArray(v) ? v : [v]; const made = arr.map((x, i) => ({ id: `${table}_${Date.now()}_${i}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...x })); tables[table].push(...made); return { select: () => thenable(() => ({ data: made, error: null })) }; },
    update(p: any) { const t = tables[table]; const q = api; const run = () => { const hit = t.filter((r) => filters.every((f) => f(r))); hit.forEach((r) => Object.assign(r, p)); rows = hit; }; return { eq(c: string, v: any) { filters.push((r) => r[c] === v); return { select() { run(); return Promise.resolve({ data: rows, error: null }); } }; }, select() { run(); return Promise.resolve({ data: rows, error: null }); }, ...q }; },
    upsert(v: any) { const arr = Array.isArray(v) ? v : [v]; for (const x of arr) { const ex = tables[table].find((r) => (x.id && r.id === x.id) || (x.email && r.email === x.email) || (x.mailbox_id && r.mailbox_id === x.mailbox_id)); if (ex) Object.assign(ex, x); else tables[table].push({ id: `${table}_${Date.now()}`, created_at: new Date().toISOString(), ...x }); } return { select: () => thenable(() => ({ data: arr, error: null })) }; },
    delete() { return { eq(c: string, v: any) { const t = tables[table]; const idx = t.findIndex((r) => r[c] === v); const removed = idx >= 0 ? t.splice(idx, 1) : []; return { select() { return Promise.resolve({ data: removed, error: null }); } }; } }; },
    then(resolve: any) {
      let out = rows.filter((r) => filters.every((f) => f(r)));
      if (order) out.sort((a, b) => (a[order!.col] < b[order!.col] ? -1 : 1) * (order!.asc ? 1 : -1));
      out = out.slice(0, lim);
      if (select.includes("(")) out = out.map((r) => { const o = { ...r }; for (const [alias, [t, fk, pk]] of Object.entries(rel[table] ?? {})) if (select.includes(alias + "(")) o[alias] = tables[t].find((x) => x[pk] === r[fk]) ?? null; return o; });
      resolve({ data: out, error: null });
    },
  };
  const builder = Object.create(api);
  builder.then = undefined;
  return builder;
}

export const supabase: any = {
  auth: {
    getSession: async () => ({ data: { session } }),
    getUser: async () => ({ data: { user } }),
    onAuthStateChange: (cb: any) => { setTimeout(() => cb("INITIAL_SESSION", session), 0); return { data: { subscription: { unsubscribe() {} } } }; },
    signOut: async () => ({}),
    signInWithPassword: async () => ({ data: { session }, error: null }),
    resetPasswordForEmail: async () => ({ error: null }),
    mfa: {
      getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal1", nextLevel: "aal1" } }),
      listFactors: async () => ({ data: { totp: [] } }),
      enroll: async () => ({ data: { id: "f1", totp: { qr_code: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><rect width='160' height='160' fill='white'/><rect x='20' y='20' width='40' height='40'/><rect x='100' y='20' width='40' height='40'/><rect x='20' y='100' width='40' height='40'/><rect x='70' y='70' width='20' height='20'/></svg>", secret: "JBSWY3DPEHPK3PXP" } }, error: null }),
      challengeAndVerify: async () => ({ error: null }),
      unenroll: async () => ({ error: null }),
    },
  },
  from: (t: string) => query(t),
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  removeChannel: () => {},
};
