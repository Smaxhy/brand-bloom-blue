import { Check, Instagram, Send } from "lucide-react";
import { followersLabel, igUrl } from "@/lib/instagram";
import { Button } from "@/components/ui/button";
import { igHandleOf } from "./store";

export function IgChip({ instagram, followers, sure, why, messagedAt, copied, onDm, onClearMessaged }: {
  instagram?: string; followers?: number | null; sure?: boolean; why?: string;
  messagedAt?: number; copied?: boolean; onDm: () => void; onClearMessaged: () => void;
}) {
  const handle = igHandleOf(instagram);
  if (!handle) return null;
  return <span className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-md border border-border bg-secondary/50 px-1.5 py-1 text-xs not-italic text-primary">
    <a href={igUrl(handle)} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 hover:underline" aria-label={`Instagram profile @${handle}`} title={why || `@${handle}`}>
      <Instagram className="h-3 w-3 shrink-0" /><span className="truncate">@{handle}</span>
    </a>
    {followersLabel(followers) && <span className="text-muted-foreground">{followersLabel(followers)}</span>}
    {sure === false && <span className="text-muted-foreground" title={why || "Name match only; check the profile"}>check</span>}
    <Button variant="ghost" size="sm" className="h-7 px-1.5 text-xs" onClick={messagedAt ? onClearMessaged : onDm}
      title={messagedAt ? `Chat opened ${new Date(messagedAt).toLocaleString()} — clear mark` : "Copy an opener and open Instagram; nothing is sent automatically"}
      aria-label={messagedAt ? `Clear chat mark for @${handle}` : `Copy a message and open a chat with @${handle}`}>
      {messagedAt ? <Check className="h-3 w-3" /> : <Send className="h-3 w-3" />}
      {messagedAt ? "chat opened" : copied ? "copied — paste it" : "DM"}
    </Button>
  </span>;
}