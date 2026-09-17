// Client-safe (no Prisma/bcrypt imports) so the login page can import this
// directly without pulling server-only code into the client bundle. See
// lib/auth.ts's authorize() for where these are thrown, and next-auth's
// signIn({redirect:false}) for how they surface as res.error.
export const AUTH_ERROR_INVALID_CREDENTIALS = "INVALID_CREDENTIALS";
export const AUTH_ERROR_ACCOUNT_DISABLED = "ACCOUNT_DISABLED";
