export interface TestMetadata {
  epics: string[];
  file: string;
  line: number;
  name: string;
  placeholders: string[];
  tags: string[];
  type: 'feature' | 'spec';
}

const JIRA_KEY_REGEX = /\b[A-Z][A-Z0-9]+-\d+\b/g;
const PLACEHOLDER_REGEX = /\b[A-Z0-9_-]*PLACEHOLDER[A-Z0-9_-]*\b/gi;
const TEST_CALL_REGEX = /\b(?:it|specify)\s*(?:\.\w+)?\s*\(\s*(['"`])([^'"`]*?)\1/g;

export function extractTestMetadataFromText(file: string, text: string): TestMetadata[] {
  if (file.endsWith('.feature')) {
    return extractFeatureMetadata(file, text);
  }

  return extractSpecMetadata(file, text);
}

export function extractEpics(value: string): string[] {
  return unique(value.match(JIRA_KEY_REGEX) ?? []);
}

export function extractPlaceholders(value: string): string[] {
  return unique((value.match(PLACEHOLDER_REGEX) ?? []).map((placeholder) => placeholder.toUpperCase()));
}

function extractFeatureMetadata(file: string, text: string): TestMetadata[] {
  const metadata: TestMetadata[] = [];
  const lines = text.split(/\r?\n/);
  let pendingTags: string[] = [];

  lines.forEach((line, lineIndex) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('@')) {
      pendingTags = [...pendingTags, ...trimmed.split(/\s+/)];
      return;
    }

    const scenarioMatch = /^\s*Scenario(?: Outline)?:\s*(.+?)\s*$/.exec(line);
    if (scenarioMatch === null) {
      if (trimmed.length > 0 && !trimmed.startsWith('#')) {
        pendingTags = [];
      }
      return;
    }

    const name = scenarioMatch[1] ?? '';
    const context = [...pendingTags, name].join(' ');
    metadata.push({
      epics: extractEpics(context),
      file,
      line: lineIndex + 1,
      name,
      placeholders: extractPlaceholders(context),
      tags: pendingTags,
      type: 'feature',
    });
    pendingTags = [];
  });

  return metadata;
}

function extractSpecMetadata(file: string, text: string): TestMetadata[] {
  const metadata: TestMetadata[] = [];
  const lineStarts = getLineStarts(text);
  let match: RegExpExecArray | null;

  while ((match = TEST_CALL_REGEX.exec(text)) !== null) {
    const title = match[2] ?? '';
    const line = lineNumberForIndex(lineStarts, match.index);
    const leadingContext = getLeadingContext(text, lineStarts, line, 6);
    const context = `${leadingContext}\n${title}`;

    metadata.push({
      epics: extractEpics(context),
      file,
      line,
      name: title,
      placeholders: extractPlaceholders(context),
      tags: extractTags(context),
      type: 'spec',
    });
  }

  return metadata;
}

function extractTags(value: string): string[] {
  return unique(value.match(/@[A-Za-z0-9_()=-]+/g) ?? []);
}

function getLeadingContext(text: string, lineStarts: number[], line: number, count: number): string {
  const startLine = Math.max(1, line - count);
  const startIndex = lineStarts[startLine - 1] ?? 0;
  const endIndex = lineStarts[line - 1] ?? text.length;

  return text.slice(startIndex, endIndex);
}

function getLineStarts(text: string): number[] {
  const starts = [0];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') {
      starts.push(index + 1);
    }
  }

  return starts;
}

function lineNumberForIndex(lineStarts: number[], index: number): number {
  let line = 1;

  for (let current = 0; current < lineStarts.length; current += 1) {
    const start = lineStarts[current];
    if (start === undefined || start > index) {
      break;
    }
    line = current + 1;
  }

  return line;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
