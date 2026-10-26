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

function readOption(
  args: string[],
  option: string,
  alias: string,
): { args: string[]; values: Record<string, unknown> } {
  const remaining: string[] = [];
  let values: Record<string, unknown> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] as string;
    const matchedOption = [option, alias].find((name) => arg === name || arg.startsWith(`${name}=`));
    if (matchedOption !== undefined) {
      const value = arg === matchedOption ? args[++index] : arg.slice(matchedOption.length + 1);
      if (value === undefined) throw new Error(`Missing value for ${matchedOption}`);
      values = { ...values, ...parseValues(value) };
    } else {
      remaining.push(arg);
    }
  }
  return { args: remaining, values };
}

/**
 * Apply the pipeline policy only to the Cypress child launched by the runner.
 * Direct Cypress runs never interpret EXCLUDE_EXTENDED_TESTS.
 */
export function applyExtendedTestSelection(suite: string, args: string[], env: NodeJS.ProcessEnv): string[] {
  if (env.EXCLUDE_EXTENDED_TESTS !== 'true' || !['component', 'functional'].includes(suite)) {
    return args;
  }

  if (suite === 'component') {
    const option = readOption(args, '--expose', '-x');
    const expose = {
      ...parseValues(env.CYPRESS_EXPOSE || ''),
      ...option.values,
    };
    const tags = String(
      option.values.grepTags ?? option.values['grep-tags'] ?? expose.grepTags ?? expose['grep-tags'] ?? '',
    ).trim();
    // Double minus applies the exclusion to every OR branch, including inherited tags.
    expose.grepTags = `${tags} --@extendedTest`.trim();
    expose.grepOmitFiltered = true;
    // Negative filters need browser evaluation, including dynamically built tags.
    expose.grepFilterSpecs = false;
    return [...option.args, '--expose', JSON.stringify(expose)];
  }

  const option = readOption(args, '--env', '-e');
  const tags = String(option.values.TAGS ?? option.values.tags ?? env.CYPRESS_TAGS ?? env.TAGS ?? '').trim();
  const expression = tags ? `(${tags}) and not @extendedTest` : 'not @extendedTest';
  env.TAGS = expression;
  env.CYPRESS_TAGS = expression;
  return [...option.args, '--env', JSON.stringify({ ...option.values, TAGS: expression })];
}
