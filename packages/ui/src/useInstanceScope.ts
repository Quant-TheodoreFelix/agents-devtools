import { useEffect, useMemo } from "react";
import { keyOfRow, useInstances } from "./Sidebar";
import { useStore, type Row } from "./store";

export function useInstanceScope(): {
  effectiveKey: string | null;
  rows: Row[];
} {
  const rows = useStore((s) => s.rows);
  const selectedInstance = useStore((s) => s.selectedInstance);
  const selectInstance = useStore((s) => s.selectInstance);
  const instances = useInstances();

  const effectiveKey = selectedInstance ?? instances[0]?.key ?? null;

  useEffect(() => {
    if (selectedInstance === null && effectiveKey !== null) {
      selectInstance(effectiveKey);
    }
  }, [selectedInstance, effectiveKey, selectInstance]);

  const scoped = useMemo(
    () =>
      effectiveKey === null
        ? []
        : rows.filter((row) => keyOfRow(row) === effectiveKey),
    [rows, effectiveKey]
  );

  return { effectiveKey, rows: scoped };
}
