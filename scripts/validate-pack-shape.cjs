const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const expectedFiles = [
  'dist/bin/run-test-suite.js',
  'dist/bin/build-component-report.js',
  'dist/bin/build-cucumber-report.js',
  'dist/bin/check-cypress-test-metadata.js',
  'dist/bin/find-tests-missing-epic.js',
  'dist/bin/find-tests-with-multiple-epics.js',
  'dist/bin/resolve-placeholder-jira-epics.js',
  'dist/index.js',
  'dist/index.d.ts',
  'README.md',
  'LICENSE',
  'package.json',
];

const expectedBins = [
  'opal-cypress-runner',
  'opal-cypress-build-component-report',
  'opal-cypress-build-cucumber-report',
  'opal-cypress-check-test-metadata',
  'opal-cypress-find-tests-missing-epic',
  'opal-cypress-find-tests-with-multiple-epics',
  'opal-cypress-resolve-placeholder-jira-epics',
];

const cacheDir = path.join(os.tmpdir(), 'npm-cache-opal-common-cypress-pack-check');
const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--cache', cacheDir], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
});
const [pack] = JSON.parse(output);
const files = new Set(pack.files.map((file) => file.path));
const missingFiles = expectedFiles.filter((file) => !files.has(file));

if (missingFiles.length > 0) {
  console.error('Package is missing expected files:');
  for (const file of missingFiles) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const missingBins = expectedBins.filter((bin) => packageJson.bin?.[bin] === undefined);

if (missingBins.length > 0) {
  console.error('package.json is missing expected bin entries:');
  for (const bin of missingBins) {
    console.error(`- ${bin}`);
  }
  process.exit(1);
}

console.log(`Validated package surface for ${pack.filename}`);
