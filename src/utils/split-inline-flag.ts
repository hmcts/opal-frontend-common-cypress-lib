/**
 * @file Helper for splitting CLI flags provided in `--flag=value` form.
 */
/**
 * Splits a token into its flag name and inline value when the token uses `--flag=value` syntax.
 *
 * @param token - Raw CLI token to inspect.
 * @returns A tuple containing the flag token and its inline value, if present.
 */
export function splitInlineFlag(token: string): [string, string | undefined] {
  const equalsIndex = token.indexOf('=');

  if (equalsIndex === -1 || !token.startsWith('-')) {
    return [token, undefined];
  }

  return [token.slice(0, equalsIndex), token.slice(equalsIndex + 1)];
}
