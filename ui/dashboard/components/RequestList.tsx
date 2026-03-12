import React from "react";
import type { CapturedRequest } from "../../../types/capturedRequest.js";
import { Badge } from "../../src/components/ui/badge.js";
import { Button } from "../../src/components/ui/button.js";
import { Pin, PinOff } from "lucide-react";

function statusVariant(status?: number): "success" | "warn" | "danger" | "muted" {
  if (!status) return "muted";
  if (status >= 200 && status < 300) return "success";
  if (status >= 300 && status < 400) return "secondary" as any;
  if (status >= 400 && status < 500) return "warn";
  return "danger";
}

function protocolLabel(p?: CapturedRequest["protocol"]): string | null {
  if (!p) return null;
  if (p === "websocket") return "ws";
  if (p === "graphql-subscription") return "gql-sub";
  if (p === "graphql") return "gql";
  if (p === "grpc") return "grpc";
  return null;
}

export function RequestList(props: {
  items: CapturedRequest[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  pinnedIds?: Set<string>;
  canPinMore?: boolean;
  onTogglePin?: (req: CapturedRequest) => void;
}) {
  return (
    <div className="divide-y overflow-hidden">
      {props.items.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground">No requests captured yet.</div>
      ) : (
        props.items.map((r) => {
          const active = r.id === props.selectedId;
          const pinned = props.pinnedIds?.has(r.id) ?? false;
          const proto = protocolLabel(r.protocol);
          const statusV = statusVariant(r.responseStatus);
          return (
            <button
              key={r.id}
              onClick={() => props.onSelect(r.id)}
              className={
                "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30 " +
                (active ? "bg-muted/40" : "")
              }
            >
              <div className="w-14 shrink-0">
                <Badge variant="outline" className="justify-center w-full">
                  {r.method}
                </Badge>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {proto && <Badge variant="muted">{proto}</Badge>}
                  <div className="truncate text-sm font-medium">{r.path}</div>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>id: {r.id.slice(0, 8)}</span>
                  {typeof r.duration === "number" && <span>· {r.duration}ms</span>}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant={statusV as any}>{r.responseStatus ?? "-"}</Badge>
                {props.onTogglePin && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={(e: React.MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                      props.onTogglePin?.(r);
                    }}
                    disabled={!pinned && props.canPinMore === false}
                    aria-label={pinned ? "Unpin" : "Pin"}
                    title={pinned ? "Unpin" : "Pin for compare"}
                  >
                    {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                  </Button>
                )}
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}
