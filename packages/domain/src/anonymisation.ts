const ADJECTIVES = [
  "Amber",
  "Cobalt",
  "Indigo",
  "Silver",
  "Crimson",
  "Golden",
  "Quiet",
  "Swift",
  "Solar",
  "Arctic",
] as const;

const ANIMALS = [
  "Falcon",
  "Heron",
  "Lynx",
  "Wolf",
  "Otter",
  "Raven",
  "Orca",
  "Fox",
  "Panda",
  "Hawk",
] as const;

export const createDelegationAlias = (randomInteger: (maximum: number) => number): string => {
  const adjective = ADJECTIVES[randomInteger(ADJECTIVES.length)];
  const animal = ANIMALS[randomInteger(ANIMALS.length)];
  const suffix = 100 + randomInteger(900);
  if (adjective === undefined || animal === undefined)
    throw new Error("Alias source is unavailable.");
  return `${adjective} ${animal}-${String(suffix)}`;
};

export const protectedContactPatterns = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,
  /\bhttps?:\/\/[^\s]+/giu,
  /\b(?:www\.)[^\s]+/giu,
  /(?:\+?\d[\d\s().-]{7,}\d)/gu,
  /(?:^|\s)@[\p{L}\p{N}_.-]{2,}/gu,
] as const;

export const findProtectedContactMatches = (value: string): string[] =>
  [...new Set(protectedContactPatterns.flatMap((pattern) => value.match(pattern) ?? []))].slice(
    0,
    20,
  );

export const containsProtectedTerm = (value: string, terms: readonly string[]): boolean => {
  const normalized = value.normalize("NFKC").toLocaleLowerCase("en-US");
  return terms.some((term) => {
    const candidate = term.normalize("NFKC").trim().toLocaleLowerCase("en-US");
    return candidate.length >= 2 && normalized.includes(candidate);
  });
};
