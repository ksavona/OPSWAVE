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

const escapePattern = (value: string): string => value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");

export interface ProtectedContentRedaction {
  readonly matches: readonly string[];
  readonly redacted: string;
}

/** Removes contact details and owner-defined privacy terms before shared chatter is stored. */
export const redactProtectedContent = (
  value: string,
  terms: readonly string[] = [],
): ProtectedContentRedaction => {
  const matches = [
    ...findProtectedContactMatches(value),
    ...terms.filter((term) => containsProtectedTerm(value, [term])),
  ];
  let redacted = value;
  for (const pattern of protectedContactPatterns) {
    redacted = redacted.replace(pattern, "[REDACTED CONTACT]");
  }
  for (const term of [...new Set(terms.map((candidate) => candidate.normalize("NFKC").trim()))]
    .filter((candidate) => candidate.length >= 2)
    .sort((left, right) => right.length - left.length)) {
    redacted = redacted.replace(
      // The owner-controlled literal is escaped before constructing this replacement expression.
      // eslint-disable-next-line security/detect-non-literal-regexp
      new RegExp(escapePattern(term), "giu"),
      "[REDACTED PRIVATE DETAIL]",
    );
  }
  return { matches: [...new Set(matches)].slice(0, 20), redacted };
};
