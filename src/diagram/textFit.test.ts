import { describe, expect, it } from "vitest";
import { fitText } from "./textFit";

const font = { size: 10 }; // senza canvas (jsdom) la stima è 5,5px per carattere

describe("fitText", () => {
  it("lascia invariato un testo che sta nella larghezza", () => {
    expect(fitText("Breve", 100, font)).toBe("Breve");
    expect(fitText("", 100, font)).toBe("");
  });

  it("tronca un testo lungo con i puntini restando nella larghezza", () => {
    const out = fitText("Un titolo decisamente troppo lungo per stare qui", 100, font);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length * 5.5).toBeLessThanOrEqual(100);
    expect(out.length).toBeGreaterThan(5);
  });

  it("con spazio nullo restituisce solo i puntini", () => {
    expect(fitText("Qualcosa", 0, font)).toBe("…");
  });
});
