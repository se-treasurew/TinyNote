import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const packageJson = JSON.parse(readFileSync(resolve(repositoryRoot, 'desktop/package.json'), 'utf8'));
const changelog = readFileSync(resolve(repositoryRoot, 'CHANGELOG.md'), 'utf8');
const heading = `## [${packageJson.version}]`;
const headingStart = changelog.indexOf(heading);

if (headingStart < 0) {
  throw new Error(`Missing ${heading} section in CHANGELOG.md`);
}

const bodyStart = changelog.indexOf('\n', headingStart) + 1;
const nextHeading = changelog.indexOf('\n## [', bodyStart);
const body = changelog.slice(bodyStart, nextHeading < 0 ? undefined : nextHeading).trim();

if (!body) {
  throw new Error(`Empty ${heading} section in CHANGELOG.md`);
}

process.stdout.write(body);
