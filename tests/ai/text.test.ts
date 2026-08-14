import { describe, expect, it } from "vitest";
import { looksPersian, pickPersianFallback } from "../../src/ai/text.js";

describe("looksPersian", () => {
  it("accepts Persian text", () => {
    expect(looksPersian("وای! یکم بزرگن، ولی عاشقشونم!")).toBe(true);
  });

  it("rejects garbled text", () => {
    expect(looksPersian("?????? ????? ????")).toBe(false);
  });

  it("rejects latin text", () => {
    expect(looksPersian("Nice shoes!")).toBe(false);
  });

  it("rejects empty or tiny text", () => {
    expect(looksPersian("")).toBe(false);
    expect(looksPersian("ب")).toBe(false);
  });
});

describe("pickPersianFallback", () => {
  it("uses the fallback for non-Persian input", () => {
    expect(pickPersianFallback("????", "وای! خیلی خوبه!")).toBe("وای! خیلی خوبه!");
  });

  it("keeps Persian input", () => {
    expect(pickPersianFallback("آفرین!", "وای! خیلی خوبه!")).toBe("آفرین!");
  });
});
