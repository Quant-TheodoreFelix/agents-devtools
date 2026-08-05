import { instanceKey } from "@agents-devtools/protocol";
import { useMemo } from "react";
import { useT } from "./i18n/useT";
import { useStore, type Row } from "./store";
import { summarizeInstances, type InstanceSummary } from "./timeline";

export function keyOfRow(row: Row): string {
  return instanceKey(row.env.event);
}

export function useInstances(): InstanceSummary[] {
  const rows = useStore((s) => s.rows);
  return useMemo(() => summarizeInstances(rows, keyOfRow), [rows]);
}

export function Sidebar() {
  const instances = useInstances();
  const selectedInstance = useStore((s) => s.selectedInstance);
  const selectInstance = useStore((s) => s.selectInstance);
  const t = useT();

  return (
    <nav className="sidebar">
      <div className="sidebar-title">{t("sidebar.instances")}</div>
      {instances.length === 0 && (
        <div className="sidebar-empty">{t("sidebar.empty")}</div>
      )}
      {instances.map((instance) => (
        <button
          key={instance.key}
          type="button"
          className={
            instance.key === selectedInstance
              ? "instance selected"
              : "instance"
          }
          onClick={() => selectInstance(instance.key)}
        >
          <span className="instance-name">{instance.key}</span>
          <span className="instance-meta">
            <span className="instance-count">{instance.count}</span>
            {instance.errorCount > 0 && (
              <span className="instance-errors">{instance.errorCount}</span>
            )}
          </span>
        </button>
      ))}
    </nav>
  );
}
