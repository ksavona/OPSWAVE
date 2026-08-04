import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const repositoryFiles = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);

const excludedFiles = new Set(["pnpm-lock.yaml", "scripts/check-secrets.mjs"]);
const maximumFileSize = 1_000_000;
const findings = [];

const highConfidencePatterns = [
  ["OpenAI API key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/gu],
  ["GitHub token", new RegExp(["gh", "[pousr]", "_[A-Za-z0-9]{20,}"].join(""), "gu")],
  ["AWS access key", new RegExp(["AKIA", "[A-Z0-9]{16}"].join(""), "gu")],
  [
    "private key",
    new RegExp(["-----BEGIN ", "(?:RSA |EC |OPENSSH )?", "PRIVATE KEY-----"].join(""), "gu"),
  ],
];

for (const path of repositoryFiles) {
  // `git ls-files --cached` also lists tracked paths deleted in the worktree.
  if (!existsSync(path) || excludedFiles.has(path) || statSync(path).size > maximumFileSize) {
    continue;
  }

  const content = readFileSync(path, "utf8");

  for (const [description, pattern] of highConfidencePatterns) {
    if (pattern.test(content)) {
      findings.push(`${path}: possible ${description}`);
    }

    pattern.lastIndex = 0;
  }
}

if (findings.length > 0) {
  process.stderr.write(`${findings.join("\n")}\nSecret scan failed.\n`);
  process.exit(1);
}

process.stdout.write(
  `Secret scan passed (${String(repositoryFiles.length)} repository files checked).\n`,
);
