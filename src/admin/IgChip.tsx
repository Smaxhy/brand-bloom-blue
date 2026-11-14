import { Check, Instagram, Send, X } from "lucide-react";
import { followersLabel, igUrl } from "@/lib/instagram";
import { Button } from "@/components/ui/button";
import type { IgStage } from "./ig-board";
import { igHandleOf } from "./store";

/**
 * A business's Instagram on a row: the profile, how sure we are it is theirs,
 * and where it sits in the Instagram list. "DM" copies an opener and opens the
 * chat; nothing is ever sent from here.
 */
export function IgChip({ instagram, followers, sure, why, stage, messagedAt, copied, onDm, onClearMessaged }: {
  instagram?: string; followers?: number | null; sure?: boolean; why?: string; stage?: IgStage;
  messagedAt?: number; copied?: boolean; onDm: () => void; onClearMessaged: () => void;
}) {
  const handle = igHandleOf(instagram);
  if (!handle) return null;
  const filed = stage === "replied" ? "replied" : stage === "skip" ? "not a fit" : messagedAt ? "DMed" : "";
  return <span className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-md border border-border bg-secondary/50 px-1.5 py-1 text-xs not-italic text-primary">
    <a href={igUrl(handle)} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 hover:underline" aria-label={`Instagram profile @${handle}`} title={why || `@${handle}`}>
      <Instagram className="h-3 w-3 shrink-0" /><span className="truncate">@{handle}</span>
    </a>
    {followersLabel(followers) && <span className="text-muted-foreground">{followersLabel(followers)}</span>}
    {sure === false && !filed && <span className="text-[oklch(.45_.12_70)]" title={why ? `Check: ${why}` : "Might not be their account: look at it first"}>check</span>}
    {filed ? (
      <span className="inline-flex items-center gap-0.5 pl-1 text-muted-foreground" title={messagedAt ? `Filed as DMed ${new Date(messagedAt).toLocaleString()}. Nothing was sent from here.` : undefined}>
        <Check className="h-3 w-3" aria-hidden="true" />{copied ? "opener copied: paste it" : filed}
        <button type="button" onClick={onClearMessaged} className="ml-0.5 grid h-5 w-5 place-items-center rounded hover:bg-secondary hover:text-foreground" title="Clear: move it back to the list to DM" aria-label={`Move @${handle} back to the list to DM`}>
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      </span>
    ) : (
      <Button variant="ghost" size="sm" className="h-7 px-1.5 text-xs" onClick={onDm}
        title="Copy an opener and open Instagram; nothing is sent automatically"
        aria-label={`Copy a message and open a chat with @${handle}`}>
        <Send className="h-3 w-3" />
        {copied ? "copied: paste it" : "DM"}
      </Button>
    )}
  </span>;
}
