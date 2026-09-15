export const formatAmount = (value: bigint): string => value.toLocaleString('en-US');

/** Epochs are whole days since 1970-01-01 UTC. */
export const epochToDate = (epoch: bigint): string =>
  new Date(Number(epoch) * 86_400_000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export const shortHex = (hex: string, lead = 10): string => (hex.length > lead + 8 ? `${hex.slice(0, lead)}…${hex.slice(-6)}` : hex);
