"use client";

import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import {
  credentialFieldRendering,
  isSecretFieldKind,
  type BankRegistryEntry,
} from "@/lib/bank-registry";

type CredentialFieldsValues = { credentials: Record<string, string> };

/**
 * The credential inputs for one institution, generated from its registry field
 * list (ADR-0013 §2). Everything about a field — label, masking, keypad — comes
 * from its descriptor and kind, so adding an institution needs no form change.
 * Must be rendered inside a `<Form>` whose values carry a `credentials` record.
 */
export function CredentialFields({
  entry,
  mode,
}: {
  entry: BankRegistryEntry;
  mode: "add" | "edit";
}) {
  const { control } = useFormContext<CredentialFieldsValues>();

  return entry.credentialFields.map((descriptor) => {
    const rendering = credentialFieldRendering(descriptor.kind);
    const secret = isSecretFieldKind(descriptor.kind);
    return (
      <FormField
        // Keyed by institution too, so switching institution mounts fresh inputs.
        key={`${entry.id}.${descriptor.key}`}
        control={control}
        name={`credentials.${descriptor.key}`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{descriptor.label}</FormLabel>
            <FormControl>
              <Input
                {...field}
                value={field.value ?? ""}
                type={rendering.inputType}
                inputMode={rendering.inputMode}
                // Keeps the browser from offering the saved app password here.
                autoComplete={secret ? "new-password" : "off"}
                placeholder={secret && mode === "edit" ? "ללא שינוי" : descriptor.hint}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    );
  });
}
