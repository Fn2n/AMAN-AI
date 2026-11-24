/**
 * Redaction of sensitive personal data before content is stored, exported, shown in the threat feed,
 * or sent to an external service. Pure function, safe in browser and server.
 */
function luhn(d: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function redact(text: string): string {
  return text
    // Emirates ID (784-YYYY-NNNNNNN-C)
    .replace(/\b784[-\s]?\d{4}[-\s]?\d{7}[-\s]?\d\b/g, '784-••••-•••••••-•')
    // UAE IBAN and generic IBANs
    .replace(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,4})?\b/g, (m) => m.slice(0, 4) + ' •••• •••• ' + m.replace(/\s/g, '').slice(-4))
    // Payment card numbers (13–19 digits passing Luhn)
    .replace(/\b(?:\d[ -]?){13,19}\b/g, (m) => {
      const d = m.replace(/\D/g, '');
      return d.length >= 13 && d.length <= 19 && luhn(d) ? `•••• •••• •••• ${d.slice(-4)}` : m;
    })
    // OTP / verification codes after a keyword
    .replace(/((?:otp|code|pin|cvv|passcode|رمز|الرمز|كود)\D{0,12})(\d{3,8})/gi, (_, a: string, code: string) => a + '•'.repeat(code.length))
    // Email addresses: keep first char and domain
    .replace(/\b([A-Z0-9._%+-])[A-Z0-9._%+-]*@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi, '$1•••@$2')
    // Phone numbers: keep country/area prefix and last 4 digits
    .replace(/(?:\+|00)?\d[\d\s-]{7,16}\d/g, (m) => {
      const digits = m.replace(/\D/g, '');
      if (digits.length < 8 || digits.length > 15) return m;
      return m.slice(0, Math.min(4, m.length - 4)) + m.slice(Math.min(4, m.length - 4), -4).replace(/\d/g, '•') + m.slice(-4);
    });
}
