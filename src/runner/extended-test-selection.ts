/** Split only top-level option boundaries, preserving JSON, quoted values and tag OR commas. */
function splitOptions(value: string): string[] {
  const entries: string[] = [];
  let start = 0;
  let valueStart = value.indexOf('=') + 1;
  let depth = 0;
  let quote: string | undefined;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote !== undefined) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = undefined;
      continue;
    }

    // Quotes and brackets within ordinary unquoted text are literal characters.
    const beginsValue = index >= valueStart && value.slice(valueStart, index).trim() === '';
    if ((char === '"' || char === "'") && (depth > 0 || beginsValue)) {
      quote = char;
    } else if ((char === '{' || char === '[') && (depth > 0 || beginsValue)) {
      depth += 1;
    } else if ((char === '}' || char === ']') && depth > 0) {
      depth -= 1;
    } else if (char === ',' && depth === 0 && /^[\w.-]+=/.test(value.slice(index + 1))) {
      entries.push(value.slice(start, index));
      start = index + 1;
      valueStart = value.indexOf('=', start) + 1;
    }
  }

  entries.push(value.slice(start));
  return entries;
}

/** Parse the JSON or key=value form accepted by Cypress --env and --expose. */
function parseValues(value: string): Record<string, unknown> {
  if (!value.trim()) return {};
  if (value.trim().startsWith('{')) {
    const parsed: unknown = JSON.parse(value);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Cypress selection options must contain an object');
    }
    return parsed as Record<string, unknown>;
  }

  const values: Record<string, unknown> = {};
  for (const entry of splitOptions(value)) {
    const equals = entry.indexOf('=');
    if (equals < 1) throw new Error(`Invalid Cypress selection option: ${entry}`);
    const raw = entry.slice(equals + 1);
    try {
      values[entry.slice(0, equals)] = JSON.parse(raw);
    } catch {
      values[entry.slice(0, equals)] = raw;
    }
  }
  return values;
}

/** Canonicalise aliases within each occurrence so later CLI occurrences win, including empty strings. */
function normaliseSelector(values: Record<string, unknown>, canonical: string, alias: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key === alias ? canonical : key, value]));
}

function readOption(
  args: string[],
  option: string,
  alias: string,
  selector?: [string, string],
): { args: string[]; values: Record<string, unknown> } {
  const remaining: string[] = [];
  let values: Record<string, unknown> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] as string;
    const matchedOption = [option, alias].find((name) => arg === name || arg.startsWith(`${name}=`));
    if (matchedOption !== undefined) {
      const value = arg === matchedOption ? args[++index] : arg.slice(matchedOption.length + 1);
      if (value === undefined) throw new Error(`Missing value for ${matchedOption}`);
      const parsed = parseValues(value);
      values = { ...values, ...(selector ? normaliseSelector(parsed, ...selector) : parsed) };
    } else {
      remaining.push(arg);
    }
  }
  return { args: remaining, values };
}

const runnerMarker = '__opalExcludeExtendedTests';

/** Pass a private CLI marker without replacing selectors that Cypress has yet to resolve. */
export function prepareExtendedTestSelection(suite: string, args: string[], env: NodeJS.ProcessEnv): string[] {
  if (env.EXCLUDE_EXTENDED_TESTS !== 'true' || !['component', 'functional'].includes(suite)) return args;

  const option = readOption(args, '--env', '-e', ['TAGS', 'tags']);
  if (suite === 'functional') {
    const inherited = env.CYPRESS_TAGS ?? env.CYPRESS_tags ?? env.TAGS;
    if (option.values.TAGS === undefined && inherited !== undefined) option.values.TAGS = inherited;
    return [...option.args, '--env', JSON.stringify({ ...option.values, [runnerMarker]: true })];
  }

  const exposed = readOption(option.args, '--expose', '-x', ['grepTags', 'grep-tags']);
  const inherited = parseValues(env.CYPRESS_EXPOSE || '');
  const inheritedTags = inherited.grepTags ?? inherited['grep-tags'];
  delete inherited['grep-tags'];
  if (inheritedTags !== undefined) inherited.grepTags = inheritedTags;
  const expose = { ...inherited, ...exposed.values };
  const prepared = [...exposed.args, '--env', JSON.stringify({ ...option.values, [runnerMarker]: true })];
  if (Object.keys(expose).length > 0) prepared.push('--expose', JSON.stringify(expose));
  return prepared;
}

interface ExtendedTestConfig {
  testingType: string;
  env: Record<string, unknown>;
  expose?: Record<string, unknown>;
}

/**
 * Compose the policy with Cypress's resolved selectors before filtering plugins register.
 * Only the runner's CLI marker enables it; direct Cypress runs ignore EXCLUDE_EXTENDED_TESTS.
 */
export function applyExtendedTestSelection<T extends ExtendedTestConfig>(config: T): T {
  if (config.env[runnerMarker] !== true) return config;
  delete config.env[runnerMarker];

  if (config.testingType === 'component') {
    const expose = (config.expose ??= {});
    const tags = String(expose.grepTags ?? expose['grep-tags'] ?? '').trim();
    const expression = `${tags} --@extendedTest`.trim();
    expose.grepTags = expression;
    expose['grep-tags'] = expression;
    expose.grepOmitFiltered = true;
    expose.grepFilterSpecs = false;
  } else {
    const tags = String(config.env.TAGS ?? config.env.tags ?? '').trim();
    const expression = tags ? `(${tags}) and not @extendedTest` : 'not @extendedTest';
    config.env.TAGS = expression;
    config.env.tags = expression;
  }
  return config;
}
