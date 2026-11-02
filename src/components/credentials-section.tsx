"use client";

import * as React from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BankIcon, CreditCardIcon, TrashIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  bankKindOf,
  bankLabel,
  enabledBankEntries,
  findBankEntry,
  isBankType,
  nonSecretCredentialValues,
  type BankType,
} from "@/lib/bank-registry";
import { CredentialFields } from "@/components/credential-fields";
import { InstitutionPicker, useInstitutionPicker } from "@/components/institution-picker";
import { InstitutionTrustBadge } from "@/components/institution-trust";
import {
  AddButton,
  RowAction,
  RowTile,
  SHEET_CONTROLS,
  SectionBody,
  SectionEmpty,
  SectionError,
  SectionHeader,
  SettingsList,
  SettingsRow,
} from "@/components/settings/parts";
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

export function CredentialsSection({ initialCredentials }: { initialCredentials: Credential[] }) {
  const [credentials, setCredentials] = React.useState<Credential[]>(initialCredentials);
  const [prevInitial, setPrevInitial] = React.useState(initialCredentials);
  const [listError, setListError] = React.useState(false);
  const [formOpen, setFormOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Credential | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Credential | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const [isDeletePending, startDeleteTransition] = React.useTransition();
  const [isListPending, startListTransition] = React.useTransition();

  // A revalidated page hands back a fresh list; adopt it (adjusting state during
  // render, the pattern React recommends over a syncing effect).
  if (initialCredentials !== prevInitial) {
    setPrevInitial(initialCredentials);
    setCredentials(initialCredentials);
  }

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
  const picker = useInstitutionPicker();
  const selectedEntry = findBankEntry(form.watch("bankType"));

  // The list arrives server-rendered; it is re-read from the GET route only
  // after a mutation, and on retry when that re-read failed.
  async function fetchCredentials() {
    try {
      const res = await fetch("/api/credentials");
      if (!res.ok) throw new Error("credentials list unavailable");
      setCredentials(await res.json());
      setListError(false);
    } catch {
      setListError(true);
    }
  }

  function retryList() {
    startListTransition(fetchCredentials);
  }

  function setDialogOpen(open: boolean) {
    if (!open) prefillRequestRef.current++;
    setFormOpen(open);
  }

  function openAdd() {
    prefillRequestRef.current++;
    editModeRef.current = false;
    setEditing(null);
    form.reset(emptyForm());
    picker.reset();
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

  // A missing acknowledgment is reported alongside field errors, not only once they are fixed.
  function onInvalid() {
    if (!editing) picker.confirmCleared(form.getValues("bankType"));
  }

  function onSubmit(values: CredentialFormValues) {
    const entry = findBankEntry(values.bankType);
    if (!entry) return;
    if (!editing && !picker.confirmCleared(values.bankType)) return;

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
    <SectionBody labelledBy="accounts">
      <SectionHeader
        section="accounts"
        description="הבנקים וחברות האשראי שמהם Yitra מסנכרנת תנועות. פרטי ההתחברות נשמרים מוצפנים, והסיסמה לא מוצגת לעולם."
        action={credentials.length > 0 && <AddButton label="הוספת חשבון" onClick={openAdd} />}
      />

      {listError && (
        <SectionError
          message={isListPending ? "טוען מחדש..." : "לא הצלחנו לרענן את רשימת החשבונות."}
          onRetry={retryList}
        />
      )}

      {credentials.length === 0 ? (
        <SectionEmpty
          icon={<BankIcon />}
          title="עדיין לא חוברו חשבונות"
          description="חברו בנק או כרטיס אשראי כדי ש-Yitra תוכל לסנכרן את התנועות שלכם."
          action={<AddButton label="חיבור חשבון" onClick={openAdd} />}
        />
      ) : (
        <SettingsList>
          {credentials.map((cred) => {
            const editable = isEditable(cred);
            return (
              <SettingsRow
                key={cred.id}
                onOpen={editable ? () => openEdit(cred) : undefined}
                openLabel={editable ? `עריכת ${cred.displayName}` : undefined}
                leading={
                  <RowTile>
                    {bankKindOf(cred.bankType) === "bank" ? <BankIcon /> : <CreditCardIcon />}
                  </RowTile>
                }
                title={cred.displayName}
                subtitle={
                  <>
                    {bankLabel(cred.bankType)}
                    <InstitutionTrustBadge trust={picker.trustOf(cred.bankType)} />
                  </>
                }
                trailing={
                  <RowAction
                    label={`מחיקת ${cred.displayName}`}
                    onClick={() => openDelete(cred)}
                    destructive
                  >
                    <TrashIcon />
                  </RowAction>
                }
              />
            );
          })}
        </SettingsList>
      )}

      <Dialog open={formOpen} onOpenChange={setDialogOpen}>
        <DialogContent className={SHEET_CONTROLS}>
          <DialogHeader>
            <DialogTitle>{editing ? "עריכת חשבון" : "חיבור חשבון"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "הסיסמה השמורה לא מוצגת. השאירו את שדות הסיסמה ריקים כדי להשאיר אותה, או הזינו חדשה כדי להחליף."
                : "פרטי ההתחברות לאתר הבנק או חברת האשראי. הם נשמרים מוצפנים ומשמשים רק לסנכרון."}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} noValidate>
              <div className="space-y-4 pb-4">
                {!editing && (
                  <FormField
                    control={form.control}
                    name="bankType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>בנק או חברת אשראי</FormLabel>
                        <FormControl>
                          <InstitutionPicker
                            picker={picker}
                            value={field.value}
                            onValueChange={(next) => {
                              field.onChange(next.id);
                              // An institution switch swaps the field set — start it clean.
                              form.setValue("credentials", emptyCredentialValues(next));
                              form.clearErrors("credentials");
                            }}
                          />
                        </FormControl>
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

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className={SHEET_CONTROLS}>
          <DialogHeader>
            <DialogTitle>מחיקת חשבון</DialogTitle>
            <DialogDescription>
              למחוק את &ldquo;{deleteTarget?.displayName}&rdquo;? יימחקו גם החשבונות והתנועות שיובאו
              ממנו. פעולה זו אינה הפיכה.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p role="alert" className="text-destructive text-body">
              {deleteError}
            </p>
          )}
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
    </SectionBody>
  );
}
