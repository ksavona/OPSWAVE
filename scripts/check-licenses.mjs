import { execFileSync } from "node:child_process";

const allowedLicenses = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC-BY-4.0",
  "ISC",
  "LGPL-3.0-or-later",
  "MIT",
  "MPL-2.0",
  "Python-2.0",
]);

const output = execFileSync("pnpm", ["licenses", "list", "--json", "--prod", "--long"], {
  encoding: "utf8",
});

const report = JSON.parse(output);
const rejected = Object.keys(report).filter((license) => !allowedLicenses.has(license));

if (rejected.length > 0) {
  process.stderr.write(`Disallowed or unreviewed production licenses: ${rejected.join(", ")}\n`);
  process.exit(1);
}

process.stdout.write(
  `Production dependency licenses passed (${Object.keys(report).sort().join(", ")}).\n`,
);
