import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { guessColumns, guessMonthFirst, parseDate, parseNumber, parseText, parseXlsx, pickRows } from "../src/importer";

describe("tracker history import", () => {
  it("reads the usual date styles (day first, as in Singapore)", () => {
    expect(parseDate("2016-10-31")).toBe("2016-10-31");
    expect(parseDate("2016-10-31T00:00:00")).toBe("2016-10-31");
    expect(parseDate("31/10/2016")).toBe("2016-10-31");
    expect(parseDate("7/11/16")).toBe("2016-11-07");
    expect(parseDate("11/7/2016", true)).toBe("2016-11-07");
    expect(parseDate("31-Oct-16")).toBe("2016-10-31");
    expect(parseDate("31 October 2016")).toBe("2016-10-31");
    expect(parseDate("Oct 31, 2016")).toBe("2016-10-31");
    expect(parseDate("31/02/2016")).toBeNull();
    expect(parseDate("DATE")).toBeNull();
    expect(parseNumber("58.5 kg")).toBe(58.5);
    expect(parseNumber("1,800")).toBe(1800);
    expect(parseNumber("kg")).toBeNull();
    expect(guessMonthFirst(["10/31/2016", "11/7/2016"])).toBe(true);
    expect(guessMonthFirst(["31/10/2016", "7/11/2016"])).toBe(false);
  });

  it("finds the date and weight columns in a pasted table with a title and header", () => {
    const t = parseText("ANSON'S BMI RECORDS\nDATE\tHEIGHT/M\tMASS/KG\tBMI\n31/10/2016\t1.61\t58\t22.4\n07/11/2016\t1.61\t57.5\t22.2\n07/11/2016\t1.61\t57\t22.0\n01/01/2099\t1.61\t50\t19\n");
    const c = guessColumns(t, ["Weight", "weight", "kg", "mass"]);
    expect(c).toEqual({ date: 0, value: 2 });
    const p = pickRows(t, c.date, c.value, false, "2026-11-05");
    expect(p.rows).toEqual([
      { date: "2016-10-31", value: 58 },
      { date: "2016-11-07", value: 57 },
    ]);
    expect(p.repeats).toBe(1);
    expect(p.skipped).toBe(3); // title, header, future date
  });

  it("reads CSV with quotes", () => {
    expect(parseText('date,"note, with comma",kg\n2016-10-31,"a ""b""",58')).toEqual([
      ["date", "note, with comma", "kg"],
      ["2016-10-31", 'a "b"', "58"],
    ]);
  });

  it("reads an Excel workbook, turning date cells into dates", () => {
    const xml = (s: string) => strToU8(`<?xml version="1.0" encoding="UTF-8"?>${s}`);
    const file = zipSync({
      "xl/workbook.xml": xml('<workbook xmlns:r="r"><sheets><sheet name="BMI" sheetId="1" r:id="rId1"/></sheets></workbook>'),
      "xl/_rels/workbook.xml.rels": xml('<Relationships><Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/></Relationships>'),
      "xl/sharedStrings.xml": xml("<sst><si><t>DATE</t></si><si><t>MASS/KG</t></si><si><r><t>Ideal </t></r><r><t>😉</t></r></si></sst>"),
      "xl/styles.xml": xml('<styleSheet><numFmts><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="2"/></cellXfs></styleSheet>'),
      "xl/worksheets/sheet1.xml": xml(
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>' +
          '<row r="2"><c r="A2" s="1"><v>42674</v></c><c r="B2"><v>1.61</v></c><c r="C2" s="2"><v>58</v></c><c r="D2" t="s"><v>2</v></c></row>' +
          '<row r="3"><c r="A3" s="1"><v>42681.5</v></c><c r="C3"><v>57.5</v></c></row></sheetData></worksheet>',
      ),
    });
    const t = parseXlsx(file);
    expect(t).toEqual([
      ["DATE", "", "MASS/KG"],
      ["2016-10-31", "1.61", "58", "Ideal 😉"],
      ["2016-11-07", "", "57.5"],
    ]);
    const c = guessColumns(t, ["weight", "kg"]);
    expect(pickRows(t, c.date, c.value, false, "2026-11-05").rows).toEqual([
      { date: "2016-10-31", value: 58 },
      { date: "2016-11-07", value: 57.5 },
    ]);
  });
});
