import { describe, expect, it } from "vitest";
import { suggestIcon } from "./iconSuggest";

describe("suggestIcon", () => {
  it("riconosce le icone curate dal nome, ignorando maiuscole e accenti", () => {
    expect(suggestIcon("Azure SQL")).toMatch(/sql/);
    expect(suggestIcon("Key Vault segreti")).toBe("kv");
    expect(suggestIcon("Business Central")).toBe("bc");
    expect(suggestIcon("Autenticazione utenti")).toBe("entra");
  });

  it("usa i sinonimi italiani", () => {
    expect(suggestIcon("Database ordini")).toBe("sql");
    expect(suggestIcon("Coda messaggi")).toBe("sb");
  });

  it("non propone nulla per nomi senza corrispondenze o troppo corti", () => {
    expect(suggestIcon("Pippo Pluto")).toBeUndefined();
    expect(suggestIcon("")).toBeUndefined();
    expect(suggestIcon("x")).toBeUndefined();
  });
});
