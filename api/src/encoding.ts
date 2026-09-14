/** Zero-padded Bytes<32> from a short ASCII label, e.g. a policy or provider id. */
export const bytes32FromLabel = (label: string): Uint8Array => {
  const encoded = new TextEncoder().encode(label);
  if (encoded.length > 32) throw new Error(`Label longer than 32 bytes: ${label}`);
  const out = new Uint8Array(32);
  out.set(encoded);
  return out;
};

/** Policy and service dates are whole days since 1970-01-01 (UTC). */
export const epochDay = (isoDate: string): bigint => {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(ms)) throw new Error(`Invalid date: ${isoDate}`);
  return BigInt(ms / 86_400_000);
};
