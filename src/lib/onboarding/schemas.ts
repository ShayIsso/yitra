import { z } from "zod";

export const MIN_PASSWORD_LENGTH = 8;
/** bcrypt reads only the first 72 bytes; anything past them would be silently ignored. */
const BCRYPT_MAX_BYTES = 72;

export const initialPasswordSchema = z
  .object({
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `הסיסמה צריכה להכיל לפחות ${MIN_PASSWORD_LENGTH} תווים`)
      .refine((p) => new TextEncoder().encode(p).length <= BCRYPT_MAX_BYTES, "הסיסמה ארוכה מדי"),
    confirmation: z.string(),
  })
  .refine((input) => input.password === input.confirmation, {
    message: "הסיסמאות אינן תואמות",
    path: ["confirmation"],
  });

export type InitialPasswordInput = z.infer<typeof initialPasswordSchema>;
