export function maskEmail(email: string): string {
  const normalizedEmail = email.trim().toLowerCase();
  const atIndex = normalizedEmail.indexOf('@');

  if (atIndex <= 0) {
    return normalizedEmail;
  }

  const localPart = normalizedEmail.slice(0, atIndex);
  const domain = normalizedEmail.slice(atIndex + 1);
  const visiblePart = localPart.slice(0, 2);
  const maskedPart = '*'.repeat(Math.max(0, localPart.length - visiblePart.length));
  return `${visiblePart}${maskedPart}@${domain}`;
}
