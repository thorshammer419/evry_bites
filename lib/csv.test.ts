import { describe, it, expect } from "vitest";
import { rowsToCsv } from "./csv";

describe("rowsToCsv", () => {
  it("joins the header and each row with commas, separated by CRLF", () => {
    const csv = rowsToCsv(
      ["Period", "Sales"],
      [
        ["August 2026", 3],
        ["September 2026", 5],
      ]
    );
    expect(csv).toBe("Period,Sales\r\nAugust 2026,3\r\nSeptember 2026,5");
  });

  it("returns just the header row when there are no data rows", () => {
    expect(rowsToCsv(["Period", "Sales"], [])).toBe("Period,Sales");
  });

  it("quotes a field containing a comma", () => {
    const csv = rowsToCsv(["Group"], [["Cookies, Deluxe"]]);
    expect(csv).toBe('Group\r\n"Cookies, Deluxe"');
  });

  it("quotes a field containing a double quote, doubling it", () => {
    const csv = rowsToCsv(["Group"], [['12" Cake']]);
    expect(csv).toBe('Group\r\n"12"" Cake"');
  });

  it("quotes a field containing a newline", () => {
    const csv = rowsToCsv(["Notes"], [["line one\nline two"]]);
    expect(csv).toBe('Notes\r\n"line one\nline two"');
  });

  it("leaves plain numbers and simple strings unquoted", () => {
    const csv = rowsToCsv(["Sales", "Period"], [[3, "August 2026"]]);
    expect(csv).toBe("Sales,Period\r\n3,August 2026");
  });
});
