/**
 * Strips redundant leading zeros while typing (e.g. "02" → "2", "030" → "30").
 * Does not strip the single "0" before a decimal ("0.5" stays valid for float entry).
 */
export function stripLeadingZerosInt(raw: string): string {
  if (raw === '' || raw === '-') return raw
  const neg = raw.startsWith('-')
  const body = neg ? raw.slice(1) : raw
  if (body.includes('.')) return raw
  const stripped = body.replace(/^0+(?=\d)/, '')
  return neg ? `-${stripped}` : stripped
}
