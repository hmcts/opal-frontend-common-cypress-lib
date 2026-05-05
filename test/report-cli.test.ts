import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildCucumberReportCli } from '../src/reports/report-cli';

function createConsumerProject(): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'opal-cypress-consumer-'));
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ name: 'consumer-project' }));

  const packageRoot = path.join(cwd, 'node_modules', '@badeball', 'cypress-cucumber-preprocessor');
  fs.mkdirSync(path.join(packageRoot, 'dist', 'helpers'), { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, 'package.json'),
    JSON.stringify({
      name: '@badeball/cypress-cucumber-preprocessor',
      main: 'dist/entrypoint-node.js',
      exports: {
        '.': {
          node: './dist/entrypoint-node.js',
          default: './dist/entrypoint-node.js',
        },
        './*': './dist/subpath-entrypoints/*.js',
      },
    }),
  );
  fs.writeFileSync(path.join(packageRoot, 'dist', 'entrypoint-node.js'), 'module.exports = {};');
  fs.writeFileSync(
    path.join(packageRoot, 'dist', 'helpers', 'merge.js'),
    'exports.mergeMessages = (messageCollections) => messageCollections.flat();',
  );
  fs.writeFileSync(
    path.join(packageRoot, 'dist', 'helpers', 'formatters.js'),
    [
      "const { Transform } = require('node:stream');",
      'exports.createHtmlStream = () => new Transform({',
      '  objectMode: true,',
      '  transform(_message, _encoding, callback) { callback(); },',
      "  flush(callback) { this.push('<html>report</html>'); callback(); },",
      '});',
      'exports.createJsonFormatter = (_messages, onData) => ({',
      "  emit(event) { if (event === 'envelope') onData('[{\"name\":\"scenario\"}]'); },",
      '});',
    ].join('\n'),
  );

  const inputDir = path.join(cwd, 'smoke-output', 'prod', 'edge', 'cucumber');
  fs.mkdirSync(inputDir, { recursive: true });
  fs.writeFileSync(
    path.join(inputDir, 'OPAL-report-1.ndjson'),
    JSON.stringify({
      testCaseStarted: {
        id: 'runtime-1',
      },
    }),
  );

  return cwd;
}

describe('Cucumber report CLI', () => {
  it('loads Cucumber helpers when package.json is hidden by a package exports map', async () => {
    const cwd = createConsumerProject();

    try {
      await expect(buildCucumberReportCli(['smoke', '--browser=edge', '--mode=opal'], cwd)).resolves.toBe(0);
      expect(
        fs.readFileSync(path.join(cwd, 'smoke-output', 'prod', 'edge', 'cucumber', 'smoke-report.html'), 'utf8'),
      ).toBe('<html>report</html>');
      expect(fs.readFileSync(path.join(cwd, 'smoke-output', 'zephyr', 'cucumber-report.json'), 'utf8')).toBe(
        '[{"name":"scenario"}]',
      );
    } finally {
      fs.rmSync(cwd, { force: true, recursive: true });
    }
  });
});
