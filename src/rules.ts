export type Severity = "high" | "medium" | "low";
export type Finding = {
  ruleId: string;
  severity: Severity;
  title: string;
  detail: string;
  file: string;
};

const AUTH_PACKAGES =
  /^(jsonwebtoken|jose|passport|passport-.*|bcrypt(?:js)?|argon2|auth0|next-auth|@auth\/.*|firebase-admin|@aws-sdk\/client-cognito-identity-provider|helmet|cors|express-session|cookie-session|oauth|openid-client|@supabase\/auth-helpers-.*)$/i;

function majorOf(v: string): number | null {
  const cleaned = v.replace(/^[^\d]*/, "");
  const m = cleaned.match(/^(\d+)/);
  return m ? Number(m[1]) : null;
}

/** Parse npm-style dependency lines from a unified diff (package.json / lock hints). */
export function scanDependencyDiff(diff: string): Finding[] {
  const findings: Finding[] = [];
  let file = "unknown";
  const oldVersions = new Map<string, string>();
  const newVersions = new Map<string, string>();

  for (const raw of diff.split(/\r?\n/)) {
    if (raw.startsWith("+++ b/")) {
      file = raw.slice(6).trim();
      continue;
    }
    if (raw.startsWith("--- a/")) continue;

    // package.json style: "lodash": "^4.17.21"
    const depLine = raw.match(/^([+-])\s*"([^"]+)"\s*:\s*"([^"]+)"\s*,?\s*$/);
    if (depLine && (file.endsWith("package.json") || file.includes("package.json"))) {
      const [, side, name, version] = depLine;
      if (name === "name" || name === "version" || name === "private") continue;
      if (side === "-") oldVersions.set(name, version);
      if (side === "+") newVersions.set(name, version);
      continue;
    }

    // Cargo.toml style rough: name = "1.2.3"
    const cargo = raw.match(/^([+-])\s*([A-Za-z0-9_-]+)\s*=\s*"([^"]+)"\s*$/);
    if (cargo && /Cargo\.toml$/i.test(file)) {
      const [, side, name, version] = cargo;
      if (side === "-") oldVersions.set(name, version);
      if (side === "+") newVersions.set(name, version);
    }
  }

  const names = new Set([...oldVersions.keys(), ...newVersions.keys()]);
  for (const name of names) {
    const before = oldVersions.get(name);
    const after = newVersions.get(name);
    if (!after) continue;

    if (AUTH_PACKAGES.test(name)) {
      findings.push({
        ruleId: "auth-package",
        severity: "high",
        title: `Auth-sensitive package changed: ${name}`,
        detail: before ? `${before} → ${after}` : `added ${after}`,
        file,
      });
    }

    if (before) {
      const majBefore = majorOf(before);
      const majAfter = majorOf(after);
      if (majBefore !== null && majAfter !== null && majAfter > majBefore) {
        findings.push({
          ruleId: "major-bump",
          severity: "medium",
          title: `Major bump: ${name} ${before} → ${after}`,
          detail: "Major upgrades often include breaking changes. Review changelog before merge.",
          file,
        });
      }
    } else if (AUTH_PACKAGES.test(name)) {
      // already flagged as auth-package
    }
  }

  // Dependabot / Renovate title cues in diff headers are rare; also scan commit message isn't available here.
  return findings;
}
