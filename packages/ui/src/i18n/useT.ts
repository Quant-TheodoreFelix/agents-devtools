import { useMemo } from "react";
import { useStore } from "../store";
import { makeT, type Translate } from "./index";

export function useT(): Translate {
  const locale = useStore((s) => s.locale);
  return useMemo(() => makeT(locale), [locale]);
}
