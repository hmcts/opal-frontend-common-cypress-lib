import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { normalizeBrowser, resolveGenericBrowser } from '../browser/browser-support';

interface ComponentReportOptions {
  browser: string;
  dryRun: boolean;
}

interface CucumberReportOptions {
  browser: string;
  dryRun: boolean;
  mode: string;
  suite: string;
}

type CucumberMessage = Record<string, unknown>;

type JsonFormatter = {
  emit: (event: string, message: CucumberMessage) => void;
};

export async function buildMochawesomeReportCli(
  argv = process.argv.slice(2),
  cwd = process.cwd(),
): Promise<number> {
  const options = parseComponentReportOptions(argv);
  const browser = options.browser || resolveGenericBrowser(process.env.BROWSER_TO_RUN);
  const { htmlDir, inputDirs } = resolveComponentReportPaths(browser);
  const { inputDir, reportFiles } = getReportFiles(inputDirs.map((inputPath) => path.resolve(cwd, inputPath)));

  if (options.dryRun) {
    console.log(`read ${inputDirs.join(', ')}`);
    console.log(`write ${htmlDir}/component-report.html`);
    return 0;
  }

  if (reportFiles.length === 0) {
    console.log(`[build-component-report] no Mochawesome JSON files found for ${browser}; skipping HTML report generation.`);
    return 0;
  }

  const requireFromConsumer = createRequire(path.join(cwd, 'package.json'));
  const { merge } = requireFromConsumer('mochawesome-merge') as {
    merge: (options: { files: string[] }) => Promise<unknown>;
  };
  const { createSync } = requireFromConsumer('mochawesome-report-generator') as {
    createSync: (report: unknown, options: Record<string, unknown>) => void;
  };

  const mergedReport = await merge({ files: reportFiles });
  createSync(mergedReport, {
    inline: false,
    overwrite: true,
    reportDir: path.resolve(cwd, htmlDir),
    reportFilename: 'component-report',
    saveHtml: true,
    saveJson: false,
  });

  console.log(`[build-component-report] browser=${browser}`);
  console.log(`[build-component-report] inputDir=${path.relative(cwd, inputDir)}`);
  console.log(`[build-component-report] inputs=${reportFiles.length}`);
  return 0;
}

export async function buildCucumberReportCli(argv = process.argv.slice(2), cwd = process.cwd()): Promise<number> {
  const options = parseCucumberReportOptions(argv);

  if (!options.suite) {
    throw new Error('A report suite must be provided: smoke or functional');
  }

  const browser = options.browser || resolveGenericBrowser(process.env.BROWSER_TO_RUN);
  const reportPaths = resolveCucumberReportPaths(options.suite, browser, options.mode || 'opal');

  if (options.dryRun) {
    console.log(`read ${reportPaths.inputDir}`);
    console.log(`write ${reportPaths.mergedPath}`);
    console.log(`write ${reportPaths.zephyrJsonPath}`);
    console.log(`write ${reportPaths.htmlPath}`);
    return 0;
  }

  const requireFromConsumer = createRequire(path.join(cwd, 'package.json'));
  const { messages, sourceFiles } = loadMessages(
    path.resolve(cwd, reportPaths.inputDir),
    path.resolve(cwd, reportPaths.mergedPath),
    requireFromConsumer,
  );

  console.log(`[build-cucumber-report] suite=${options.suite}`);
  console.log(`[build-cucumber-report] mode=${options.mode || 'opal'}`);
  console.log(`[build-cucumber-report] browser=${browser}`);
  console.log(`[build-cucumber-report] inputs=${sourceFiles.length}`);

  writeMergedNdjson(path.resolve(cwd, reportPaths.mergedPath), messages);
  writeZephyrJson(path.resolve(cwd, reportPaths.zephyrJsonPath), messages, requireFromConsumer);
  await writeHtmlReport(path.resolve(cwd, reportPaths.htmlPath), messages, requireFromConsumer);
  return 0;
}

function createRemappedTestCaseStartedId(originalId: string, sourceFile: string, usedIds: Set<string>): string {
  const shardName = path.basename(sourceFile, path.extname(sourceFile)).replace(/[^a-zA-Z0-9_-]/g, '_');
  let suffix = 1;
  let candidate = `${originalId}__${shardName}`;

  while (usedIds.has(candidate)) {
    suffix += 1;
    candidate = `${originalId}__${shardName}_${suffix}`;
  }

  return candidate;
}

function getReportFiles(inputDirs: string[]): { inputDir: string; reportFiles: string[] } {
  for (const inputDir of inputDirs) {
    if (!fs.existsSync(inputDir)) {
      continue;
    }

    const reportFiles = fs
      .readdirSync(inputDir)
      .filter((filename) => filename.endsWith('.json'))
      .map((filename) => path.join(inputDir, filename))
      .sort();

    if (reportFiles.length > 0) {
      return { inputDir, reportFiles };
    }
  }

  return { inputDir: '', reportFiles: [] };
}

function loadCucumberHelpers(requireFromConsumer: NodeJS.Require): {
  createHtmlStream: () => NodeJS.ReadWriteStream;
  createJsonFormatter: (messages: CucumberMessage[], onData: (chunk: string) => void) => JsonFormatter;
  mergeMessages: (messageCollections: CucumberMessage[][]) => CucumberMessage[];
} {
  const entrypointPath = requireFromConsumer.resolve('@badeball/cypress-cucumber-preprocessor');
  const packageDist = path.dirname(entrypointPath);
  const { mergeMessages } = requireFromConsumer(path.join(packageDist, 'helpers/merge.js')) as {
    mergeMessages: (messageCollections: CucumberMessage[][]) => CucumberMessage[];
  };
  const { createHtmlStream, createJsonFormatter } = requireFromConsumer(
    path.join(packageDist, 'helpers/formatters.js'),
  ) as {
    createHtmlStream: () => NodeJS.ReadWriteStream;
    createJsonFormatter: (messages: CucumberMessage[], onData: (chunk: string) => void) => JsonFormatter;
  };

  return { createHtmlStream, createJsonFormatter, mergeMessages };
}

function loadMessages(
  inputDir: string,
  mergedPath: string,
  requireFromConsumer: NodeJS.Require,
): { messages: CucumberMessage[]; sourceFiles: string[] } {
  if (!fs.existsSync(inputDir)) {
    throw new Error(`Cucumber report input directory does not exist: ${inputDir}`);
  }

  const mergedFilename = path.basename(mergedPath);
  const sourceFiles = fs
    .readdirSync(inputDir)
    .filter((filename) => filename.endsWith('.ndjson'))
    .filter((filename) => filename !== mergedFilename)
    .map((filename) => path.join(inputDir, filename))
    .sort();

  if (sourceFiles.length === 0) {
    throw new Error(`No source ndjson files found in ${inputDir}`);
  }

  const messageCollections = sourceFiles
    .map((filePath) => {
      const content = fs.readFileSync(filePath, 'utf8').trim();

      if (!content) {
        return [];
      }

      return content.split('\n').map((line, index) => {
        try {
          return JSON.parse(line) as CucumberMessage;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`Invalid ndjson in ${filePath} at line ${index + 1}: ${message}`);
        }
      });
    })
    .filter((collection) => collection.length > 0);

  if (messageCollections.length === 0) {
    throw new Error(`All ndjson inputs in ${inputDir} were empty`);
  }

  const { mergeMessages } = loadCucumberHelpers(requireFromConsumer);

  return {
    messages: mergeMessages(normalizeRuntimeMessageIds(messageCollections, sourceFiles)),
    sourceFiles,
  };
}

function normalizeRuntimeMessageIds(
  messageCollections: CucumberMessage[][],
  sourceFiles: string[],
): CucumberMessage[][] {
  const usedTestCaseStartedIds = new Set<string>();

  return messageCollections.map((collection, index) => {
    const sourceFile = sourceFiles[index] || `shard-${index}`;
    const remappedIds = new Map<string, string>();

    for (const message of collection) {
      const runtimeId = getNestedString(message, ['testCaseStarted', 'id']);

      if (!runtimeId) {
        continue;
      }

      if (usedTestCaseStartedIds.has(runtimeId)) {
        if (!remappedIds.has(runtimeId)) {
          const remappedId = createRemappedTestCaseStartedId(runtimeId, sourceFile, usedTestCaseStartedIds);
          remappedIds.set(runtimeId, remappedId);
          usedTestCaseStartedIds.add(remappedId);
        }

        continue;
      }

      usedTestCaseStartedIds.add(runtimeId);
    }

    if (remappedIds.size === 0) {
      return collection;
    }

    console.log(
      `[build-cucumber-report] remapped ${remappedIds.size} colliding testCaseStarted id(s) in ${path.basename(sourceFile)}`,
    );

    return collection.map((message) => {
      const runtimeId = getNestedString(message, ['testCaseStarted', 'id']);
      const remappedRuntimeId = runtimeId ? remappedIds.get(runtimeId) : undefined;
      const messageWithRuntimeId =
        remappedRuntimeId === undefined
          ? message
          : {
              ...message,
              testCaseStarted: {
                ...(message.testCaseStarted as Record<string, unknown>),
                id: remappedRuntimeId,
              },
            };

      return remapTestCaseStartedReferences(messageWithRuntimeId, remappedIds) as CucumberMessage;
    });
  });
}

function parseComponentReportOptions(argv: string[]): ComponentReportOptions {
  const options: ComponentReportOptions = {
    browser: '',
    dryRun: false,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--browser=')) {
      options.browser = normalizeBrowser(arg.split('=')[1]);
    }
  }

  return options;
}

function parseCucumberReportOptions(argv: string[]): CucumberReportOptions {
  const options: CucumberReportOptions = {
    browser: '',
    dryRun: false,
    mode: '',
    suite: '',
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--browser=')) {
      options.browser = normalizeBrowser(arg.split('=')[1]);
    } else if (arg.startsWith('--mode=')) {
      options.mode = arg.split('=')[1]?.trim().toLowerCase() || '';
    } else if (arg.startsWith('--suite=')) {
      options.suite = arg.split('=')[1]?.trim().toLowerCase() || '';
    } else if (!options.suite) {
      options.suite = arg.trim().toLowerCase();
    }
  }

  if (options.suite === 'legacy') {
    options.suite = 'functional';
    options.mode = 'legacy';
  }

  if (!options.mode) {
    options.mode = 'opal';
  }

  return options;
}

function remapTestCaseStartedReferences(value: unknown, remappedIds: Map<string, string>): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const remapped = remapTestCaseStartedReferences(item, remappedIds);
      if (remapped !== item) changed = true;
      return remapped;
    });

    return changed ? next : value;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  let changed = false;
  const next: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    let remappedValue = nestedValue;

    if (key === 'testCaseStartedId' && typeof nestedValue === 'string' && remappedIds.has(nestedValue)) {
      remappedValue = remappedIds.get(nestedValue);
    } else {
      remappedValue = remapTestCaseStartedReferences(nestedValue, remappedIds);
    }

    if (remappedValue !== nestedValue) {
      changed = true;
    }

    next[key] = remappedValue;
  }

  return changed ? next : value;
}

function resolveComponentReportPaths(browser: string): { htmlDir: string; inputDirs: string[] } {
  return {
    htmlDir: path.join('functional-output', 'component', browser, 'html'),
    inputDirs: [
      path.join('functional-output', 'component', browser, 'json', '.jsons'),
      path.join('functional-output', 'component', browser, 'json'),
    ],
  };
}

function resolveCucumberReportPaths(
  suite: string,
  browser: string,
  mode: string,
): { htmlPath: string; inputDir: string; mergedPath: string; zephyrJsonPath: string } {
  switch (`${suite}:${mode}`) {
    case 'functional:opal':
      return {
        htmlPath: path.join('functional-output', 'prod', browser, 'cucumber', `${browser}-report.html`),
        inputDir: path.join('functional-output', 'prod', browser, 'cucumber'),
        mergedPath: path.join('functional-output', 'prod', browser, 'cucumber', `${browser}-report.ndjson`),
        zephyrJsonPath: path.join('functional-output', 'zephyr', 'cucumber-report.json'),
      };
    case 'functional:legacy':
      return {
        htmlPath: path.join('functional-output', 'prod', browser, 'legacy', 'cucumber', 'legacy-report.html'),
        inputDir: path.join('functional-output', 'prod', browser, 'legacy', 'cucumber'),
        mergedPath: path.join('functional-output', 'prod', browser, 'legacy', 'cucumber', 'legacy-report.ndjson'),
        zephyrJsonPath: path.join('functional-output', 'zephyr', 'cucumber-report.json'),
      };
    case 'smoke:opal':
      return {
        htmlPath: path.join('smoke-output', 'prod', browser, 'cucumber', 'smoke-report.html'),
        inputDir: path.join('smoke-output', 'prod', browser, 'cucumber'),
        mergedPath: path.join('smoke-output', 'prod', browser, 'cucumber', 'smoke-report.ndjson'),
        zephyrJsonPath: path.join('smoke-output', 'zephyr', 'cucumber-report.json'),
      };
    case 'smoke:legacy':
      return {
        htmlPath: path.join('smoke-output', 'prod', browser, 'legacy', 'cucumber', 'legacy-report.html'),
        inputDir: path.join('smoke-output', 'prod', browser, 'legacy', 'cucumber'),
        mergedPath: path.join('smoke-output', 'prod', browser, 'legacy', 'cucumber', 'legacy-report.ndjson'),
        zephyrJsonPath: path.join('smoke-output', 'zephyr', 'cucumber-report.json'),
      };
    default:
      throw new Error(`Unsupported Cucumber report suite/mode: ${suite || '(empty)'}/${mode || '(empty)'}`);
  }
}

function getNestedString(value: Record<string, unknown>, keys: string[]): string {
  let current: unknown = value;

  for (const key of keys) {
    if (!current || typeof current !== 'object') {
      return '';
    }
    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === 'string' ? current : '';
}

function writeMergedNdjson(outputPath: string, messages: CucumberMessage[]): void {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, messages.map((message) => JSON.stringify(message)).join('\n'));
}

async function writeHtmlReport(
  outputPath: string,
  messages: CucumberMessage[],
  requireFromConsumer: NodeJS.Require,
): Promise<void> {
  const { createHtmlStream } = loadCucumberHelpers(requireFromConsumer);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await pipeline(Readable.from(messages, { objectMode: true }), createHtmlStream(), fs.createWriteStream(outputPath));
}

function writeZephyrJson(
  outputPath: string,
  messages: CucumberMessage[],
  requireFromConsumer: NodeJS.Require,
): void {
  const { createJsonFormatter } = loadCucumberHelpers(requireFromConsumer);
  let jsonOutput = '';
  const eventBroadcaster = createJsonFormatter(messages, (chunk) => {
    jsonOutput = chunk;
  });

  for (const message of messages) {
    eventBroadcaster.emit('envelope', message);
  }

  if (!jsonOutput) {
    throw new Error('Failed to generate cucumber JSON output');
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, jsonOutput);
}
