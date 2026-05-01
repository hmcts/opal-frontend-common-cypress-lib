import fs from 'node:fs';
import path from 'node:path';
import { resolveReportPaths } from './report-paths';
import { run } from '../utils/run-command';
import { resolvePackageBin } from '../utils/resolve-package-bin';

interface ReportCliOptions {
  dryRun: boolean;
  input?: string;
  outputDir?: string;
  reportFilename: string;
  suite: string;
}

export async function buildMochawesomeReportCli(
  argv = process.argv.slice(2),
  cwd = process.cwd(),
): Promise<number> {
  const options = parseReportCliOptions(argv);
  const paths = resolveReportPaths({ cwd, outputDir: options.outputDir, suite: options.suite });
  const input = options.input ?? paths.mochawesomePattern;

  if (options.dryRun) {
    console.log(`mochawesome-merge ${input} > ${paths.mergedJson}`);
    console.log(`marge ${paths.mergedJson} --reportDir ${paths.htmlDir} --reportFilename ${options.reportFilename}`);
    return 0;
  }

  fs.mkdirSync(path.dirname(paths.mergedJson), { recursive: true });
  fs.mkdirSync(paths.htmlDir, { recursive: true });

  const mergeBin = resolvePackageBin(cwd, 'mochawesome-merge', 'mochawesome-merge');
  const mergeOutput = await runAndCapture(mergeBin, [input], cwd);
  fs.writeFileSync(paths.mergedJson, mergeOutput);

  const margeBin = resolvePackageBin(cwd, 'mochawesome-report-generator', 'marge');
  return run(margeBin, [paths.mergedJson, '--reportDir', paths.htmlDir, '--reportFilename', options.reportFilename], cwd);
}

export async function buildCucumberReportCli(argv = process.argv.slice(2), cwd = process.cwd()): Promise<number> {
  const options = parseReportCliOptions(argv);
  const paths = resolveReportPaths({ cwd, outputDir: options.outputDir, suite: options.suite });
  const input = path.resolve(cwd, options.input ?? paths.cucumberJson);

  if (options.dryRun) {
    console.log(`read ${input}`);
    console.log(`write ${paths.cucumberHtml}`);
    return 0;
  }

  if (!fs.existsSync(input)) {
    throw new Error(`Cucumber JSON report not found at ${input}`);
  }

  const report = JSON.parse(fs.readFileSync(input, 'utf8')) as unknown;
  fs.mkdirSync(path.dirname(paths.cucumberHtml), { recursive: true });
  fs.writeFileSync(paths.cucumberHtml, renderCucumberHtmlReport(report));
  return 0;
}

function parseReportCliOptions(argv: string[]): ReportCliOptions {
  const options: ReportCliOptions = {
    dryRun: false,
    reportFilename: 'index',
    suite: 'functional',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) {
      continue;
    }

    const [flag, inlineValue] = splitInlineFlag(token);
    const readValue = (): string => {
      if (inlineValue !== undefined) {
        return inlineValue;
      }
      index += 1;
      const value = argv[index];
      if (value === undefined) {
        throw new Error(`Missing value for ${flag}`);
      }
      return value;
    };

    switch (flag) {
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--input':
        options.input = readValue();
        break;
      case '--output-dir':
        options.outputDir = readValue();
        break;
      case '--report-filename':
        options.reportFilename = readValue();
        break;
      case '--suite':
        options.suite = readValue();
        break;
      default:
        throw new Error(`Unknown report option ${token}`);
    }
  }

  return options;
}

function renderCucumberHtmlReport(report: unknown): string {
  const features = Array.isArray(report) ? report : [report];
  const rows = features
    .map((feature) => {
      const candidate = feature as { elements?: unknown[]; name?: string; uri?: string };
      const name = escapeHtml(candidate.name ?? candidate.uri ?? 'Cucumber feature');
      const scenarioCount = Array.isArray(candidate.elements) ? candidate.elements.length : 0;
      return `<tr><td>${name}</td><td>${scenarioCount}</td></tr>`;
    })
    .join('\n');

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head><meta charset="utf-8"><title>OPAL Cypress Cucumber Report</title></head>',
    '<body>',
    '<h1>OPAL Cypress Cucumber Report</h1>',
    '<table><thead><tr><th>Feature</th><th>Scenarios</th></tr></thead><tbody>',
    rows,
    '</tbody></table>',
    '</body>',
    '</html>',
  ].join('\n');
}

function runAndCapture(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = import('node:child_process').then(({ spawn }) => {
      const spawned = spawn(command, args, {
        cwd,
        env: process.env,
        shell: process.platform === 'win32',
        stdio: ['ignore', 'pipe', 'inherit'],
      });

      let stdout = '';
      spawned.stdout.setEncoding('utf8');
      spawned.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
      spawned.on('error', reject);
      spawned.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`${command} exited with ${code ?? 1}`));
        }
      });
    });

    child.catch(reject);
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function splitInlineFlag(token: string): [string, string | undefined] {
  const equalsIndex = token.indexOf('=');

  if (equalsIndex === -1 || !token.startsWith('-')) {
    return [token, undefined];
  }

  return [token.slice(0, equalsIndex), token.slice(equalsIndex + 1)];
}
