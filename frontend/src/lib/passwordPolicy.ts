// Mirrors apps/accounts/validators.py exactly (backend is authoritative).
// Uppercase is recommended only and never blocks submission.
export const MIN_PASSWORD_LENGTH = 12;

export interface PasswordChecks {
  length: boolean;
  letter: boolean;
  number: boolean;
  special: boolean;
  uppercase: boolean; // informational only
}

export function evaluatePassword(pw: string): PasswordChecks {
  return {
    length: pw.length >= MIN_PASSWORD_LENGTH,
    letter: /\p{L}/u.test(pw),
    number: /\p{Nd}/u.test(pw),
    special: /[^\p{L}\p{N}]/u.test(pw),
    uppercase: /\p{Lu}/u.test(pw),
  };
}

export const passwordAcceptable = (c: PasswordChecks) => c.length && c.letter && c.number && c.special;
