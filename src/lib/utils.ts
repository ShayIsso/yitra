import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge must know the custom type-scale steps (globals.css, ADR-0015)
 * are font sizes: otherwise it reads `text-title` as a text colour and drops
 * it whenever a colour such as `text-pos` follows.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: { text: ["caption", "body", "lead", "title", "headline", "display"] },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
