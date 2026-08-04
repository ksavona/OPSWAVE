export interface SyntheticIntakeFixture {
  readonly content: string;
  readonly title: string;
}

export const createSyntheticIntakeFixture = (
  overrides: Partial<SyntheticIntakeFixture> = {},
): SyntheticIntakeFixture => ({
  content: "Prepare a synthetic weekly operations review with no identifying data.",
  title: "Synthetic operations review",
  ...overrides,
});
