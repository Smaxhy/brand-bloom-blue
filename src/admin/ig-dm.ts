import { igDmUrl } from "@/lib/instagram";
import { igDmText, igHandleOf, IG_DM_VARIANTS } from "./store";

/** A different opener each time: the same text pasted again and again is what Instagram flags. */
let dmSeq = Math.floor(Math.random() * IG_DM_VARIANTS);

/**
 * Copy a suggested opener and open a chat with the account in Instagram.
 * Nothing is sent by this app — you paste and press send yourself.
 */
export function openInstagramDm(p: {
  instagram?: string;
  company?: string;
  name?: string;
  city?: string;
  industry?: string;
}): string {
  const handle = igHandleOf(p.instagram);
  if (!handle) return "";
  const text = igDmText(
    { company: p.company, name: p.name, city: p.city, industry: p.industry },
    dmSeq++,
  );
  void navigator.clipboard?.writeText(text).catch(() => {});
  window.open(igDmUrl(handle), "_blank", "noreferrer");
  return handle;
}
