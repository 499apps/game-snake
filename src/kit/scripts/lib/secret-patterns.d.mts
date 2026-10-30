export interface SecretFinding {
  name: string;
  line: number;
  snippet: string;
}
export const SECRET_PATTERNS: { name: string; re: RegExp }[];
export const PATH_PATTERNS: { name: string; re: RegExp }[];
export const EMAIL_PATTERN: RegExp;
export function isAllowedEmail(email: string): boolean;
export function findSecrets(text: string): SecretFinding[];
export function mask(value: string): string;
