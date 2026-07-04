/**
 * Renders the v8 coverage totals as a Markdown table into the GitHub Actions run
 * summary ($GITHUB_STEP_SUMMARY). Falls back to stdout when run locally.
 *
 * Reads `coverage/coverage-summary.json`, produced by Vitest's `json-summary`
 * coverage reporter. Exits quietly if the file is missing (e.g. tests failed before
 * coverage was written) so it never masks the real failure.
 */
import { existsSync, readFileSync, appendFileSync } from 'node:fs';

const SUMMARY_PATH = 'coverage/coverage-summary.json';

if (!existsSync(SUMMARY_PATH)) {
  console.log(`No coverage summary found at ${SUMMARY_PATH}; skipping.`);
  process.exit(0);
}

const { total } = JSON.parse(readFileSync(SUMMARY_PATH, 'utf8'));
const row = (metric) => `| ${metric} | ${total[metric].pct}% | ${total[metric].covered}/${total[metric].total} |`;

const markdown = [
  `### Coverage (Node ${process.version})`,
  '',
  '| Metric | % | Covered / Total |',
  '| --- | --- | --- |',
  row('statements'),
  row('branches'),
  row('functions'),
  row('lines'),
  '',
].join('\n');

const summaryFile = process.env.GITHUB_STEP_SUMMARY;
if (summaryFile) {
  appendFileSync(summaryFile, `${markdown}\n`);
} else {
  console.log(markdown);
}
