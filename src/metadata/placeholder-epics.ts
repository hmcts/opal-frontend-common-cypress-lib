export interface PlaceholderEpicReplacement {
  from: string;
  line: number;
  to: string;
}

export interface UnresolvedPlaceholderEpic {
  line: number;
  placeholder: string;
}

export interface PlaceholderEpicResolution {
  replacements: PlaceholderEpicReplacement[];
  text: string;
  unresolved: UnresolvedPlaceholderEpic[];
}

export type PlaceholderEpicMap = Record<string, string>;

const PLACEHOLDER_EPIC_TAG_REGEX =
  /(@(?:jiraEpic|epic)(?:\s*\(\s*|\s*[:=]\s*|\s+))([A-Z0-9_-]*PLACEHOLDER[A-Z0-9_-]*)(\s*\)?)/gi;

export function resolvePlaceholderEpicsInText(text: string, mapping: PlaceholderEpicMap): PlaceholderEpicResolution {
  const replacements: PlaceholderEpicReplacement[] = [];
  const unresolved: UnresolvedPlaceholderEpic[] = [];
  const normalizedMapping = normalizeMapping(mapping);

  const resolvedText = text.replace(
    PLACEHOLDER_EPIC_TAG_REGEX,
    (match: string, prefix: string, placeholder: string, suffix: string, offset: number) => {
      const normalizedPlaceholder = placeholder.toUpperCase();
      const line = lineNumberForIndex(text, offset);
      const replacement = normalizedMapping[normalizedPlaceholder];

      if (replacement === undefined) {
        unresolved.push({
          line,
          placeholder,
        });
        return match;
      }

      replacements.push({
        from: placeholder,
        line,
        to: replacement,
      });

      return `${prefix}${replacement}${suffix}`;
    },
  );

  return {
    replacements,
    text: resolvedText,
    unresolved,
  };
}

function normalizeMapping(mapping: PlaceholderEpicMap): PlaceholderEpicMap {
  return Object.fromEntries(Object.entries(mapping).map(([key, value]) => [key.toUpperCase(), value]));
}

function lineNumberForIndex(text: string, index: number): number {
  return text.slice(0, index).split(/\r?\n/).length;
}
