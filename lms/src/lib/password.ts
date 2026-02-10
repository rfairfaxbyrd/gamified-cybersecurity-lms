import bcrypt from "bcryptjs";

/**
 * What this file does
 * - Centralizes password hashing + verification for the MVP.
 *
 * Key concepts (plain English)
 * - We never store plain-text passwords in the database.
 * - We store a *hash* (a one-way scrambled version).
 * - To verify a password, we compare the user's input to the stored hash.
 *
 * How it works
 * - `bcrypt.hash` adds a salt and produces a strong password hash.
 * - `bcrypt.compare` checks if an input password matches a stored hash.
 *
 * How to change it
 * - If you later use university SSO, you can retire this file.
 */

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

