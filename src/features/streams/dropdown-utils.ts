const PALETTE = ["blue", "teal", "violet", "amber", "rose", "cyan", "lime", "indigo", "orange", "pink", "emerald", "sky"] as const;

export type DropdownDotTone = (typeof PALETTE)[number];

export function toneFromSeed(seed: string): DropdownDotTone {
  const hash = String(seed)
    .split("")
    .reduce((total, char) => total + char.charCodeAt(0), 0);
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
