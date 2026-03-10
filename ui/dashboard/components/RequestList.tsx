import React from "react";
import type { CapturedRequest } from "../../../types/capturedRequest";

function statusColor(status?: number): string {
  if (!status) return "var(--muted)";
  if (status >= 200 && status < 300) return "var(--green)";
  if (status >= 300 && status < 400) return "var(--blue)";
  if (status >= 400 && status < 500) return "var(--yellow)";
  return "var(--red)";
}

export function RequestList(props: {
  items: CapturedRequest[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div style={{ height: "calc(100vh - 64px)", overflow: "auto" }}>
      <div className="listHeader">
        <div>METHOD</div>
        <div>PATH</div>
        <div style={{ textAlign: "right" }}>STATUS</div>
        <div style={{ textAlign: "right" }}>TIME</div>
      </div>

      {props.items.map((r) => {
        const active = r.id === props.selectedId;
        return (
          <button
            key={r.id}
            onClick={() => props.onSelect(r.id)}
            className={`listItemButton ${active ? "listItemButton--active" : ""}`}
          >
            <div className="listRow">
              <div className="mono" style={{ fontSize: 12, color: "var(--text)" }}>
                {r.method}
              </div>
              <div className="mono" style={{ fontSize: 12, color: "var(--text)" }}>
                {r.path}
              </div>
              <div className="mono" style={{ textAlign: "right", color: statusColor(r.responseStatus) }}>
                {r.responseStatus ?? "-"}
              </div>
              <div className="mono" style={{ textAlign: "right", color: "var(--muted)" }}>
                {typeof r.duration === "number" ? `${r.duration}ms` : "-"}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
