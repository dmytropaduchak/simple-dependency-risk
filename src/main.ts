import * as core from "@actions/core";
import * as github from "@actions/github";
import { scanDependencyDiff, type Finding } from "./rules";

const MARKER = "<!-- simple-dependency-risk -->";
const NAME = "Simple Dependency Risk";

function formatFindings(findings: Finding[]): string {
  if (!findings.length) {
    return [MARKER, `## ${NAME}`, "", "No risky dependency upgrades detected in the PR diff."].join("\n");
  }
  const rows = findings
    .map((f) => `| ${f.severity} | \`${f.ruleId}\` | ${f.file} | ${f.title} |`)
    .join("\n");
  return [
    MARKER,
    `## ${NAME}`,
    "",
    `Found **${findings.length}** issue(s).`,
    "",
    "| Severity | Rule | Location | Detail |",
    "| --- | --- | --- | --- |",
    rows,
  ].join("\n");
}

async function upsertPrComment(token: string, body: string): Promise<void> {
  const { context } = github;
  if (context.eventName !== "pull_request" && context.eventName !== "pull_request_target") return;
  const issue_number = context.payload.pull_request?.number;
  if (!issue_number) return;
  const octokit = github.getOctokit(token);
  const { data: comments } = await octokit.rest.issues.listComments({ ...context.repo, issue_number });
  const existing = comments.find((c) => c.body?.includes(MARKER));
  if (existing) {
    await octokit.rest.issues.updateComment({ ...context.repo, comment_id: existing.id, body });
    return;
  }
  await octokit.rest.issues.createComment({ ...context.repo, issue_number, body });
}

async function fetchPullDiff(token: string): Promise<string> {
  const { context } = github;
  const pr = context.payload.pull_request?.number;
  if (!pr) throw new Error("No pull request in context. Run on pull_request.");
  const octokit = github.getOctokit(token);
  const res = await octokit.rest.pulls.get({
    ...context.repo,
    pull_number: pr,
    mediaType: { format: "diff" },
  });
  return typeof res.data === "string" ? res.data : String(res.data);
}

async function run(): Promise<void> {
  const token = core.getInput("github-token") || process.env.GITHUB_TOKEN || "";
  const failOn = (core.getInput("fail-on") || "none").toLowerCase();
  if (!token) {
    core.setFailed("github-token is required");
    return;
  }
  const diff = await fetchPullDiff(token);
  const findings = scanDependencyDiff(diff);
  const summary = formatFindings(findings);
  await core.summary.addRaw(summary, true).write();
  for (const f of findings) {
    if (f.severity === "high") core.error(`${f.title} (${f.ruleId})`, { file: f.file });
    else core.warning(`${f.title} (${f.ruleId})`, { file: f.file });
  }
  try {
    await upsertPrComment(token, summary);
  } catch (e) {
    core.warning(`Could not post PR comment: ${e instanceof Error ? e.message : String(e)}`);
  }
  core.setOutput("finding-count", String(findings.length));
  const shouldFail =
    failOn === "high"
      ? findings.some((f) => f.severity === "high")
      : failOn === "medium"
        ? findings.some((f) => f.severity === "high" || f.severity === "medium")
        : false;
  if (shouldFail) core.setFailed(`simple-dependency-risk: ${findings.length} finding(s)`);
  else core.info(`Done. ${findings.length} finding(s).`);
}

run().catch((e) => core.setFailed(e instanceof Error ? e.message : String(e)));
