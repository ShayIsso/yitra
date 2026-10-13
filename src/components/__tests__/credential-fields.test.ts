import { describe, it, expect } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useForm, type FieldValues } from "react-hook-form";
import type { BankRegistryEntry } from "@/lib/bank-registry";
import { registered } from "@/lib/bank-registry/__tests__/registered";
import { syntheticIssuer } from "@/lib/bank-registry/__tests__/synthetic-entries";
import { Form } from "@/components/ui/form";
import { CredentialFields } from "@/components/credential-fields";

function render(entry: BankRegistryEntry, mode: "add" | "edit") {
  function Harness() {
    const form = useForm<FieldValues>({ defaultValues: { credentials: {} } });
    const providerProps = form as typeof form & { children: ReactNode };
    return createElement(Form, providerProps, createElement(CredentialFields, { entry, mode }));
  }
  return renderToStaticMarkup(createElement(Harness));
}

function inputs(html: string): string[] {
  return html.match(/<input[^>]*>/g) ?? [];
}

describe("CredentialFields", () => {
  it("renders one labelled input per field of an institution none of the verified ones resemble, in order", () => {
    const html = render(syntheticIssuer, "add");

    const labels = [...html.matchAll(/<label[^>]*>([^<]*)<\/label>/g)].map((m) => m[1]);
    expect(labels).toEqual(["שש ספרות אחרונות", "קוד משתמש", "סיסמה"]);
    expect(inputs(html).map((input) => input.match(/name="([^"]*)"/)?.[1])).toEqual([
      "credentials.card6Digits",
      "credentials.userCode",
      "credentials.password",
    ]);
  });

  it("gives the six-digit card field a numeric keypad and masks only the password", () => {
    const [card6, userCode, password] = inputs(render(syntheticIssuer, "add"));

    expect(card6).toContain('inputMode="numeric"');
    expect(card6).toContain('type="text"');
    expect(userCode).toContain('type="text"');
    expect(password).toContain('type="password"');
  });

  it("renders each verified institution's own field set and nothing from another's", () => {
    expect(inputs(render(registered("discount"), "add"))).toHaveLength(3);
    const maxHtml = render(registered("max"), "add");
    expect(maxHtml).toContain("שם משתמש");
    expect(maxHtml).not.toContain("תעודת זהות");
  });

  it("tells the owner a blank secret keeps the stored one when editing", () => {
    const [, , password] = inputs(render(syntheticIssuer, "edit"));

    expect(password).toContain('placeholder="ללא שינוי"');
  });

  it("hints that a card issuer's username is the internet username, not the national id", () => {
    for (const id of ["max", "visaCal"]) {
      const [username] = inputs(render(registered(id), "add"));
      expect(username).toContain('placeholder="שם משתמש לאינטרנט"');
    }
  });
});
