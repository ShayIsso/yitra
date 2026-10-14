"use client";

import * as React from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormRootError,
  FormSubmit,
  applyActionErrors,
} from "@/components/ui/form";
import { addCredentialSchema, editCredentialSchema } from "@/lib/credentials/schemas";
import {
  credentialValuesFor,
  emptyCredentialValues,
  planCredentialEdit,
  type CredentialValues,
} from "@/lib/credentials/form";
import {
  bankLabel,
  enabledBankEntries,
  enabledBankTypes,
  findBankEntry,
  isBankType,
  nonSecretCredentialValues,
  type BankType,
} from "@/lib/bank-registry";
import { BankBadge } from "@/components/bank-badge";
import { CredentialFields } from "@/components/credential-fields";
import {
  addCredentialAction,
  updateCredentialAction,
  deleteCredentialAction,
} from "@/app/actions/credentials";

type Credential = {
  id: string;
  /** Stored text, so it may name an institution no longer registered (ADR-0013 §4). */
  bankType: string;
  displayName: string;
  createdAt: string;
};

/**
 * A credential whose institution is still registered. Only these can be
 * edited: an unregistered institution has no field set to edit against, so its
 * row offers delete only.
 */
type EditableCredential = Credential & { bankType: BankType };

export function isEditable(cred: Credential): cred is EditableCredential {
  return isBankType(cred.bankType);
}

/**
 * The institution picker's menu, in registry order. The trigger labels the
 * selection through the same `bankLabel`, so menu and trigger cannot disagree.
 */
export function bankPickerOptions(): { value: BankType; label: string }[] {
  return enabledBankTypes().map((value) => ({ value, label: bankLabel(value) }));
}

/**
 * `credentials` holds exactly the selected institution's fields, keyed as its
 * registry entry declares them; the module-owned schema validates only those.
 */
type CredentialFormValues = {
  bankType: BankType;
  displayName: string;
  credentials: CredentialValues;
};

function emptyForm(): CredentialFormValues {
  const [first] = enabledBankEntries();
  return { bankType: first.id, displayName: "", credentials: emptyCredentialValues(first) };
}

export function CredentialsSection() {
  const [credentials, setCredentials] = React.useState<Credential[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [formOpen, setFormOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Credential | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Credential | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const [isDeletePending, startDeleteTransition] = React.useTransition();

  // The resolver reads the current dialog mode (add vs edit) through a ref so
  // one stable RHF instance can validate with the add schema (password
  // required) or the edit schema (blank password = keep the stored one).
  const editModeRef = React.useRef(false);
  // Snapshot of the edit form's prefilled non-secret fields, to detect
  // changes that would be silently dropped without a replacement password.
  const prefillRef = React.useRef<CredentialValues>({});
  // Bumped whenever the dialog opens or closes, so a prefill response that
  // arrives after the owner moved on cannot write one credential's fields into
  // another's form.
  const prefillRequestRef = React.useRef(0);
  const resolver = React.useMemo<Resolver<CredentialFormValues>>(() => {
    // The union's input type is narrower per-branch than the generic form
    // values, hence the cast; the schemas are module-owned and shared with
    // the Server Actions, so parity is asserted in tests, not here.
    const addResolver = zodResolver(
      addCredentialSchema,
    ) as unknown as Resolver<CredentialFormValues>;
    const editResolver = zodResolver(
      editCredentialSchema,
    ) as unknown as Resolver<CredentialFormValues>;
    return (values, context, options) =>
      (editModeRef.current ? editResolver : addResolver)(values, context, options);
  }, []);

  const form = useForm<CredentialFormValues>({ resolver, defaultValues: emptyForm() });
  const selectedEntry = findBankEntry(form.watch("bankType"));

  async function fetchCredentials() {
    const res = await fetch("/api/credentials");
    if (res.ok) {
      setCredentials(await res.json());
    }
    setLoading(false);
  }

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the list stays client-fetched: #118 scoped Server Actions to mutations only, the GET routes remain
    fetchCredentials();
  }, []);

  function setDialogOpen(open: boolean) {
    if (!open) prefillRequestRef.current++;
    setFormOpen(open);
  }

  function openAdd() {
    prefillRequestRef.current++;
    editModeRef.current = false;
    setEditing(null);
    form.reset(emptyForm());
    setFormOpen(true);
  }

  async function openEdit(cred: EditableCredential) {
    const entry = findBankEntry(cred.bankType);
    if (!entry) return;
    const request = ++prefillRequestRef.current;
    editModeRef.current = true;
    prefillRef.current = {};
    setEditing(cred);
    form.reset({
      bankType: cred.bankType,
      displayName: cred.displayName,
      credentials: emptyCredentialValues(entry),
    });
    setFormOpen(true);

    // Prefill the non-secret fields; secret fields always start blank and the
    // stored password is never sent to the client.
    const res = await fetch(`/api/credentials/${cred.id}`);
    if (res.ok) {
      const data = await res.json();
      if (request !== prefillRequestRef.current) return;
      const prefill = nonSecretCredentialValues(entry.credentialFields, data.safeFields ?? {});
      prefillRef.current = prefill;
      for (const [key, value] of Object.entries(prefill)) {
        form.setValue(`credentials.${key}`, value);
      }
    }
  }

  function openDelete(cred: Credential) {
    setDeleteTarget(cred);
    setDeleteError(null);
    setDeleteOpen(true);
  }

  function onSubmit(values: CredentialFormValues) {
    const entry = findBankEntry(values.bankType);
    if (!entry) return;

    // Absent means "keep the stored credentials": the update then carries no
    // credential fields, so a password is only sent when the owner typed one.
    let replacement: CredentialValues | undefined;
    if (editing) {
      const plan = planCredentialEdit(entry, values.credentials, prefillRef.current);
      if (plan.kind === "needs-secret") {
        const label = entry.credentialFields.find((field) => field.key === plan.field)?.label;
        form.setError(`credentials.${plan.field}`, {
          message: `כדי לעדכן את פרטי ההתחברות יש להזין ${label}`,
        });
        return;
      }
      if (plan.kind === "replace") replacement = plan.credentials;
    }

    startTransition(async () => {
      const result = editing
        ? await updateCredentialAction({
            id: editing.id,
            bankType: values.bankType,
            displayName: values.displayName,
            ...(replacement ? { credentials: replacement } : {}),
          })
        : await addCredentialAction({
            bankType: values.bankType,
            displayName: values.displayName,
            credentials: credentialValuesFor(entry, values.credentials),
          });

      if (result.error || result.fieldErrors) {
        // Server-side validation lands in the same inline mechanism as client errors.
        applyActionErrors(form, result);
        return;
      }

      setDialogOpen(false);
      await fetchCredentials();
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    startDeleteTransition(async () => {
      const result = await deleteCredentialAction({ id: deleteTarget.id });
      if (result.error) {
        setDeleteError(result.error);
        return;
      }
      setDeleteOpen(false);
      await fetchCredentials();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">חשבונות בנק</h3>
        <Button onClick={openAdd} size="sm">
          <Plus />
          הוסף חשבון
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={`skeleton-${i}`} size="sm">
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <div className="flex items-center gap-1">
                  <Skeleton className="h-7 w-7 rounded-md" />
                  <Skeleton className="h-7 w-7 rounded-md" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : credentials.length === 0 ? (
        <EmptyState
          icon={Landmark}
          heading="לא הוגדרו חשבונות בנק"
          explainer="הוסף את הבנק הראשון שלך כדי להתחיל לסנכרן עסקאות."
          cta={{ label: "הוסף חשבון", onClick: openAdd }}
        />
      ) : (
        <div className="space-y-2 transition-opacity duration-150">
          {credentials.map((cred) => (
            <Card key={cred.id} size="sm">
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <BankBadge bankType={cred.bankType} />
                  <span className="text-sm font-medium">{cred.displayName}</span>
                </div>
                <div className="flex items-center gap-1">
                  {isEditable(cred) && (
                    <Button variant="ghost" size="icon-sm" onClick={() => openEdit(cred)}>
                      <Pencil />
                      <span className="sr-only">ערוך</span>
                    </Button>
                  )}
                  <Button variant="ghost" size="icon-sm" onClick={() => openDelete(cred)}>
                    <Trash2 className="text-destructive" />
                    <span className="sr-only">מחק</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "ערוך חשבון בנק" : "הוסף חשבון בנק"}</DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
              <div className="space-y-4 pt-2">
                {!editing && (
                  <FormField
                    control={form.control}
                    name="bankType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>סוג בנק</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={(v) => {
                            const next = v ? findBankEntry(v) : undefined;
                            if (!next) return;
                            field.onChange(next.id);
                            // An institution switch swaps the field set — start it clean.
                            form.setValue("credentials", emptyCredentialValues(next));
                            form.clearErrors("credentials");
                          }}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <span>{bankLabel(field.value)}</span>
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {bankPickerOptions().map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>שם תצוגה</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="לדוגמה: חשבון עיקרי" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {selectedEntry && (
                  <CredentialFields entry={selectedEntry} mode={editing ? "edit" : "add"} />
                )}

                <FormRootError />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={isPending}
                >
                  ביטול
                </Button>
                <FormSubmit pending={isPending} pendingText="שומר...">
                  שמור
                </FormSubmit>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>מחיקת חשבון בנק</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            האם למחוק את &ldquo;{deleteTarget?.displayName}&rdquo;? פעולה זו אינה הפיכה.
          </p>
          {deleteError && <p className="text-destructive text-sm">{deleteError}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={isDeletePending}
            >
              ביטול
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeletePending}>
              {isDeletePending ? "מוחק..." : "מחק"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
