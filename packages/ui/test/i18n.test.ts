import { describe, expect, it } from "vitest";
import { en } from "../src/i18n/en";
import {
  DICTIONARIES,
  format,
  isLocaleId,
  LOCALE_IDS,
  LOCALE_LABELS,
  makeT,
  pickLocale
} from "../src/i18n";

describe("dictionaries", () => {
  const baseKeys = Object.keys(en).sort();

  it("every locale covers exactly the base keys", () => {
    for (const id of LOCALE_IDS) {
      expect(Object.keys(DICTIONARIES[id]).sort()).toEqual(baseKeys);
    }
  });

  it("no locale has an empty message", () => {
    for (const id of LOCALE_IDS) {
      for (const value of Object.values(DICTIONARIES[id])) {
        expect(value.trim()).not.toBe("");
      }
    }
  });

  it("stream.empty keeps the {code} slot in every locale", () => {
    for (const id of LOCALE_IDS) {
      expect(DICTIONARIES[id]["stream.empty"]).toContain("{code}");
    }
  });

  it("every locale has a label", () => {
    for (const id of LOCALE_IDS) {
      expect(LOCALE_LABELS[id].trim()).not.toBe("");
    }
  });
});

describe("format", () => {
  it("replaces named params", () => {
    expect(format("{count} events", { count: 3 })).toBe("3 events");
  });

  it("keeps unknown placeholders", () => {
    expect(format("{count} {missing}", { count: 1 })).toBe("1 {missing}");
  });

  it("returns template without params", () => {
    expect(format("{count} events")).toBe("{count} events");
  });
});

describe("pickLocale", () => {
  it("prefers a valid stored locale", () => {
    expect(pickLocale("ko", "en-US")).toBe("ko");
  });

  it("rejects unknown stored values", () => {
    expect(pickLocale("xx", "en-US")).toBe("en");
    expect(pickLocale('{"a":1}', undefined)).toBe("en");
  });

  it("falls back to the navigator language base", () => {
    expect(pickLocale(null, "ko-KR")).toBe("ko");
    expect(pickLocale(null, "KO")).toBe("ko");
  });

  it("defaults to en", () => {
    expect(pickLocale(null, "fr-FR")).toBe("en");
    expect(pickLocale(null, undefined)).toBe("en");
  });
});

describe("isLocaleId", () => {
  it("accepts registered ids only", () => {
    expect(isLocaleId("en")).toBe(true);
    expect(isLocaleId("ko")).toBe(true);
    expect(isLocaleId("toString")).toBe(false);
    expect(isLocaleId(null)).toBe(false);
  });
});

describe("makeT", () => {
  it("translates with params per locale", () => {
    expect(makeT("en")("header.events", { count: "5" })).toBe("5 events");
    expect(makeT("ko")("header.events", { count: "5" })).toBe("이벤트 5건");
  });
});
