/**
 * @file Parsing and validation helpers for enforcing Jira metadata requirements on Cypress tests.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/**
 * Default root directory for covered Cypress component tests.
 */
export const DEFAULT_COMPONENT_ROOT = path.join('cypress', 'component');
/**
 * Default root directory for covered Cypress feature tests.
 */
export const DEFAULT_FEATURE_ROOT = path.join('cypress', 'e2e');

const JIRA_DEFECT_PREFIX = '@JIRA-DEFECT:';
const JIRA_EPIC_PREFIX = '@JIRA-EPIC:';
const JIRA_NFR_PREFIX = '@JIRA-NFR:';
const JIRA_STORY_PREFIX = '@JIRA-STORY:';
const SCENARIO_KEYWORDS = ['Scenario Outline:', 'Scenario:', 'Example:'] as const;

/**
 * Supported test kinds validated by the Jira metadata policy.
 */
export type JiraMetadataTestKind = 'component' | 'e2e';

/**
 * Directory options that determine which component and feature tests are covered by validation.
 */
export interface JiraMetadataPolicyOptions {
  componentRoot: string;
  excludedFeatureFiles: string[];
  featureRoot: string;
}

/**
 * Normalized representation of a single component or feature test discovered during parsing.
 */
export interface JiraMetadataTestUnit {
  defects: string[];
  epics: string[];
  filePath: string;
  id: string;
  kind: JiraMetadataTestKind;
  line: number;
  nfrs: string[];
  stories: string[];
  title: string;
}

/**
 * A parsed test unit plus the Jira metadata requirements it failed to satisfy.
 */
export interface JiraMetadataFailure extends JiraMetadataTestUnit {
  missing: string[];
}

/**
 * Aggregate result returned from a Jira metadata validation pass.
 */
export interface JiraMetadataValidationResult {
  failures: JiraMetadataFailure[];
  tests: JiraMetadataTestUnit[];
}

/**
 * TypeScript source file with optional parse diagnostics exposed for validation error reporting.
 */
type SourceFileWithParseDiagnostics = ts.SourceFile & {
  parseDiagnostics?: readonly ts.DiagnosticWithLocation[];
};

/**
 * Minimal function metadata required to resolve helper-returned tag arrays.
 */
type FunctionDefinition = {
  bodyExpression: ts.Expression | null;
  parameters: { isRest: boolean; name: string }[];
};

/**
 * Lookup tables used while resolving identifiers, helper calls, and tag expressions inside AST walks.
 */
type ResolverContext = {
  declarations: Map<string, ts.Expression>;
  functions: Map<string, FunctionDefinition>;
};

/**
 * Applies default directory settings for Jira metadata validation.
 *
 * @param options - Partial policy options supplied by the caller.
 * @returns A fully populated options object with default roots and exclusions.
 */
export function resolveJiraMetadataPolicyOptions(
  options: Partial<JiraMetadataPolicyOptions> = {},
): JiraMetadataPolicyOptions {
  return {
    componentRoot: options.componentRoot ?? DEFAULT_COMPONENT_ROOT,
    excludedFeatureFiles: options.excludedFeatureFiles ?? [],
    featureRoot: options.featureRoot ?? DEFAULT_FEATURE_ROOT,
  };
}

/**
 * Validates every covered test unit and reports which Jira metadata tags are missing.
 *
 * @param options - Partial policy options supplied by the caller.
 * @param cwd - Base directory used to resolve configured roots.
 * @returns All discovered test units plus any policy failures.
 */
export function validateJiraMetadataPolicy(
  options: Partial<JiraMetadataPolicyOptions> = {},
  cwd = process.cwd(),
): JiraMetadataValidationResult {
  const resolvedOptions = resolveJiraMetadataPolicyOptions(options);
  const coveredTestFiles = getCoveredJiraMetadataTestFiles(resolvedOptions, cwd);
  const tests: JiraMetadataTestUnit[] = [];
  const failures: JiraMetadataFailure[] = [];

  for (const filePath of coveredTestFiles) {
    const absoluteFilePath = path.resolve(cwd, filePath);
    const content = fs.readFileSync(absoluteFilePath, 'utf8');
    const units = parseTestUnits(filePath, content);

    tests.push(...units);

    for (const unit of units) {
      const missing = validateTestUnit(unit);

      if (missing.length > 0) {
        failures.push({ ...unit, missing });
      }
    }
  }

  return { failures, tests };
}

/**
 * Lists the supported component and feature test files covered by the Jira metadata policy.
 *
 * @param options - Partial policy options supplied by the caller.
 * @param cwd - Base directory used to resolve configured roots.
 * @returns Sorted relative paths for covered test files.
 */
export function getCoveredJiraMetadataTestFiles(
  options: Partial<JiraMetadataPolicyOptions> = {},
  cwd = process.cwd(),
): string[] {
  const resolvedOptions = resolveJiraMetadataPolicyOptions(options);

  return dedupe([
    ...listSupportedTestFiles(resolvedOptions.componentRoot, resolvedOptions, cwd),
    ...listSupportedTestFiles(resolvedOptions.featureRoot, resolvedOptions, cwd),
  ]).sort((left, right) => left.localeCompare(right));
}

/**
 * Computes which required Jira metadata tags are missing from a single test unit.
 *
 * @param unit - Parsed test unit to validate.
 * @returns The list of missing tag requirements for the unit.
 */
function validateTestUnit(unit: JiraMetadataTestUnit): string[] {
  const missing: string[] = [];

  if (unit.kind === 'component' && unit.stories.length === 0 && unit.defects.length === 0) {
    missing.push('@JIRA-STORY or @JIRA-DEFECT');
  }

  if (unit.kind === 'e2e' && unit.stories.length === 0 && unit.nfrs.length === 0 && unit.defects.length === 0) {
    missing.push('@JIRA-STORY or @JIRA-NFR or @JIRA-DEFECT');
  }

  if (unit.epics.length === 0) {
    missing.push('@JIRA-EPIC');
  }

  return missing;
}

/**
 * Routes a supported test file to the parser that understands its format.
 *
 * @param filePath - Relative test-file path.
 * @param content - Raw file contents.
 * @returns Parsed test units for the file, or an empty list for unsupported files.
 */
function parseTestUnits(filePath: string, content: string): JiraMetadataTestUnit[] {
  if (filePath.endsWith('.feature')) {
    return parseFeatureTests(filePath, content);
  }

  if (
    filePath.endsWith('.cy.ts') ||
    filePath.endsWith('.cy.tsx') ||
    filePath.endsWith('.cy.js') ||
    filePath.endsWith('.cy.jsx')
  ) {
    return parseComponentTests(filePath, content);
  }

  return [];
}

/**
 * Parses Cypress component tests by walking the TypeScript AST for suites, tests, and attached tags.
 *
 * @param filePath - Relative component-test file path.
 * @param content - Raw component-test source.
 * @returns Parsed component test units.
 */
function parseComponentTests(filePath: string, content: string): JiraMetadataTestUnit[] {
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, getScriptKind(filePath));
  const parseDiagnostics = (sourceFile as SourceFileWithParseDiagnostics).parseDiagnostics ?? [];

  if (parseDiagnostics.length > 0) {
    const diagnostic = parseDiagnostics[0];

    if (!diagnostic) {
      throw new Error(`Failed to parse ${filePath}`);
    }

    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    throw new Error(`Failed to parse ${filePath}: ${message}`);
  }

  const resolverContext = createResolverContext(sourceFile);
  const tests: JiraMetadataTestUnit[] = [];

  /**
   * Walks the component-test AST, accumulating suite titles and inherited tags as nested calls are visited.
   *
   * @param node - Current AST node being visited.
   * @param suiteTitles - Suite titles collected from parent `describe()` or `context()` calls.
   * @param inheritedTags - Tags inherited from parent suites.
   * @returns Nothing. Parsed test units are appended to `tests`.
   */
  function visit(node: ts.Node, suiteTitles: string[], inheritedTags: string[]): void {
    if (ts.isCallExpression(node)) {
      const suiteTitle = extractSuiteTitle(node, resolverContext, sourceFile);

      if (suiteTitle) {
        const suiteTags = extractComponentTags(node, resolverContext, sourceFile);
        const callback = getLastFunctionArgument(node);

        if (callback?.body) {
          visit(callback.body, [...suiteTitles, suiteTitle], dedupe([...inheritedTags, ...suiteTags]));
        }

        return;
      }

      const testTitle = extractTestTitle(node, resolverContext, sourceFile);

      if (testTitle) {
        const tags = dedupe([...inheritedTags, ...extractComponentTags(node, resolverContext, sourceFile)]);
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        const title = [...suiteTitles, testTitle].join(' > ');

        tests.push({
          defects: tags.filter((tag) => tag.startsWith(JIRA_DEFECT_PREFIX)),
          epics: tags.filter((tag) => tag.startsWith(JIRA_EPIC_PREFIX)),
          filePath,
          id: title,
          kind: 'component',
          line: line + 1,
          nfrs: tags.filter((tag) => tag.startsWith(JIRA_NFR_PREFIX)),
          stories: tags.filter((tag) => tag.startsWith(JIRA_STORY_PREFIX)),
          title,
        });

        return;
      }
    }

    ts.forEachChild(node, (child) => visit(child, suiteTitles, inheritedTags));
  }

  visit(sourceFile, [], []);

  return tests;
}

/**
 * Parses feature files into test units, carrying tags from feature, rule, scenario, and examples scopes.
 *
 * @param filePath - Relative feature-file path.
 * @param content - Raw feature-file contents.
 * @returns Parsed end-to-end test units.
 */
function parseFeatureTests(filePath: string, content: string): JiraMetadataTestUnit[] {
  const lines = content.split(/\r?\n/u);
  const tests: JiraMetadataTestUnit[] = [];
  let pendingTags: string[] = [];
  let featureTags: string[] = [];
  let ruleTags: string[] = [];
  let currentScenario:
    | {
        exampleCount: number;
        hasExamples: boolean;
        line: number;
        tags: string[];
        title: string;
      }
    | null = null;

  /**
   * Flushes the current scenario when the parser moves into a new Gherkin block.
   *
   * @returns Nothing. Parsed scenarios are appended to `tests`.
   */
  function finalizeScenario(): void {
    if (!currentScenario) {
      return;
    }

    if (!currentScenario.hasExamples) {
      tests.push(buildFeatureTestUnit(filePath, currentScenario.title, currentScenario.line, currentScenario.tags, null));
    }

    currentScenario = null;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];

    if (rawLine === undefined) {
      continue;
    }

    const trimmedLine = rawLine.trim();

    if (trimmedLine === '' || trimmedLine.startsWith('#')) {
      continue;
    }

    if (trimmedLine.startsWith('@')) {
      pendingTags = [...pendingTags, ...trimmedLine.split(/\s+/u).filter((token) => token.startsWith('@'))];
      continue;
    }

    if (trimmedLine.startsWith('Feature:')) {
      finalizeScenario();
      featureTags = [...pendingTags];
      ruleTags = [];
      pendingTags = [];
      continue;
    }

    if (trimmedLine.startsWith('Rule:')) {
      finalizeScenario();
      ruleTags = [...pendingTags];
      pendingTags = [];
      continue;
    }

    const scenarioMatch = SCENARIO_KEYWORDS.map((keyword) => ({ keyword, title: extractKeywordValue(trimmedLine, keyword) })).find(
      ({ title }) => title !== undefined,
    );

    if (scenarioMatch) {
      finalizeScenario();
      currentScenario = {
        exampleCount: 0,
        hasExamples: false,
        line: index + 1,
        // Scenario-level tags inherit any tags attached at the feature or rule scope.
        tags: dedupe([...featureTags, ...ruleTags, ...pendingTags]),
        title: scenarioMatch.title ?? '',
      };
      pendingTags = [];
      continue;
    }

    if (trimmedLine.startsWith('Examples:')) {
      if (currentScenario) {
        currentScenario.exampleCount += 1;
        currentScenario.hasExamples = true;
        // Treat each examples block as its own test unit so scenario-outline metadata stays attributable.
        tests.push(
          buildFeatureTestUnit(
            filePath,
            currentScenario.title,
            index + 1,
            dedupe([...currentScenario.tags, ...pendingTags]),
            currentScenario.exampleCount,
            extractKeywordValue(trimmedLine, 'Examples:'),
          ),
        );
      }

      pendingTags = [];
      continue;
    }

    pendingTags = [];
  }

  finalizeScenario();

  return tests;
}

/**
 * Builds a Jira metadata test unit for a feature scenario or examples block.
 *
 * @param filePath - Relative feature-file path.
 * @param scenarioTitle - Scenario title as it appears in the feature.
 * @param line - One-based line number where the scenario or examples block starts.
 * @param tags - Tags in scope for the test unit.
 * @param exampleIndex - One-based examples index, or `null` for a plain scenario.
 * @param examplesTitle - Optional examples title suffix.
 * @returns A normalized end-to-end test unit.
 */
function buildFeatureTestUnit(
  filePath: string,
  scenarioTitle: string,
  line: number,
  tags: string[],
  exampleIndex: number | null,
  examplesTitle = '',
): JiraMetadataTestUnit {
  const suffix = exampleIndex === null ? '' : ` [Examples ${exampleIndex}${examplesTitle ? `: ${examplesTitle}` : ''}]`;
  const title = `${scenarioTitle}${suffix}`;

  return {
    defects: tags.filter((tag) => tag.startsWith(JIRA_DEFECT_PREFIX)),
    epics: tags.filter((tag) => tag.startsWith(JIRA_EPIC_PREFIX)),
    filePath,
    id: title,
    kind: 'e2e',
    line,
    nfrs: tags.filter((tag) => tag.startsWith(JIRA_NFR_PREFIX)),
    stories: tags.filter((tag) => tag.startsWith(JIRA_STORY_PREFIX)),
    title,
  };
}

/**
 * Recursively collects supported test files beneath a configured root.
 *
 * @param rootDirectory - Root directory to walk.
 * @param options - Resolved policy options used to filter files.
 * @param cwd - Base directory used for path resolution and relativization.
 * @returns Sorted relative paths for supported test files under the root.
 */
function listSupportedTestFiles(rootDirectory: string, options: JiraMetadataPolicyOptions, cwd: string): string[] {
  const absoluteRoot = path.resolve(cwd, rootDirectory);

  if (!fs.existsSync(absoluteRoot)) {
    return [];
  }

  const files: string[] = [];

  function walk(directory: string): void {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const relativePath = path.relative(cwd, absolutePath).split(path.sep).join('/');

      if (isSupportedTestFile(relativePath, options)) {
        files.push(relativePath);
      }
    }
  }

  walk(absoluteRoot);

  return files.sort((left, right) => left.localeCompare(right));
}

/**
 * Determines whether a relative path is a supported component test or feature file under the configured roots.
 *
 * @param filePath - Relative file path to check.
 * @param options - Resolved policy options used to filter files.
 * @returns `true` when the file should be included in policy validation.
 */
function isSupportedTestFile(filePath: string, options: JiraMetadataPolicyOptions): boolean {
  const componentRoot = normalizeRoot(options.componentRoot);
  const featureRoot = normalizeRoot(options.featureRoot);
  const excludedFeatureFiles = new Set(options.excludedFeatureFiles.map((value) => value.split(path.sep).join('/')));

  if (
    (filePath.endsWith('.cy.ts') ||
      filePath.endsWith('.cy.tsx') ||
      filePath.endsWith('.cy.js') ||
      filePath.endsWith('.cy.jsx')) &&
    filePath.startsWith(componentRoot)
  ) {
    return true;
  }

  if (filePath.endsWith('.feature') && filePath.startsWith(featureRoot) && !excludedFeatureFiles.has(filePath)) {
    return true;
  }

  return false;
}

/**
 * Resolves the title of a supported suite call such as `describe()` or `context()`.
 *
 * @param node - Call expression to inspect.
 * @param resolverContext - Precomputed declaration and function lookup data.
 * @param sourceFile - Source file containing the call expression.
 * @returns The resolved suite title, or `null` when the call is not a supported suite.
 */
function extractSuiteTitle(
  node: ts.CallExpression,
  resolverContext: ResolverContext,
  sourceFile: ts.SourceFile,
): string | null {
  if (!isCallNamed(node.expression, ['describe', 'context'])) {
    return null;
  }

  const titleArgument = node.arguments[0];

  return titleArgument ? resolveStringLike(titleArgument, resolverContext, sourceFile) : null;
}

/**
 * Resolves the title of a supported test call such as `it()` or `test()`.
 *
 * @param node - Call expression to inspect.
 * @param resolverContext - Precomputed declaration and function lookup data.
 * @param sourceFile - Source file containing the call expression.
 * @returns The resolved test title, or `null` when the call is not a supported test.
 */
function extractTestTitle(
  node: ts.CallExpression,
  resolverContext: ResolverContext,
  sourceFile: ts.SourceFile,
): string | null {
  if (!isCallNamed(node.expression, ['it', 'specify', 'test'])) {
    return null;
  }

  const titleArgument = node.arguments[0];

  return titleArgument ? resolveStringLike(titleArgument, resolverContext, sourceFile) : null;
}

/**
 * Checks whether a call expression ultimately targets one of the supplied function names.
 *
 * @param expression - Call target expression to inspect.
 * @param names - Allowed function names.
 * @returns `true` when the call resolves to one of the supplied names.
 */
function isCallNamed(expression: ts.LeftHandSideExpression, names: string[]): boolean {
  if (ts.isIdentifier(expression)) {
    return names.includes(expression.text);
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return isCallNamed(expression.expression, names);
  }

  return false;
}

/**
 * Returns the last function argument from a call expression.
 *
 * @param node - Call expression whose arguments should be scanned.
 * @returns The last arrow function or function expression argument, or `null` when none exists.
 */
function getLastFunctionArgument(node: ts.CallExpression): ts.FunctionLikeDeclarationBase | null {
  for (let index = node.arguments.length - 1; index >= 0; index -= 1) {
    const argument = node.arguments[index];

    if (argument && (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument))) {
      return argument;
    }
  }

  return null;
}

/**
 * Extracts component-test tags from an options object passed directly or indirectly into a suite or test call.
 *
 * @param node - Call expression to inspect.
 * @param resolverContext - Precomputed declaration and function lookup data.
 * @param sourceFile - Source file containing the call expression.
 * @returns Resolved Jira-related tags for the call.
 */
function extractComponentTags(
  node: ts.CallExpression,
  resolverContext: ResolverContext,
  sourceFile: ts.SourceFile,
): string[] {
  const optionsArgument = node.arguments.find((argument) => {
    if (ts.isObjectLiteralExpression(argument)) {
      return true;
    }

    if (ts.isIdentifier(argument)) {
      const initializer = resolverContext.declarations.get(argument.text);

      return initializer ? ts.isObjectLiteralExpression(stripExpressionWrappers(initializer)) : false;
    }

    return false;
  });

  if (!optionsArgument) {
    return [];
  }

  const optionsObject = resolveObjectLiteral(optionsArgument, resolverContext.declarations);

  if (!optionsObject) {
    return [];
  }

  for (const property of optionsObject.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }

    if (getPropertyName(property.name) === 'tags') {
      return dedupe(resolveTagList(property.initializer, resolverContext, sourceFile, new Set(), new Map(), new Set()));
    }
  }

  return [];
}

/**
 * Resolves an expression to an object literal, following identifier indirection where possible.
 *
 * @param expression - Expression that may represent an object literal.
 * @param declarations - Known variable declarations keyed by identifier name.
 * @returns The resolved object literal, or `null` when it cannot be resolved.
 */
function resolveObjectLiteral(
  expression: ts.Expression,
  declarations: Map<string, ts.Expression>,
): ts.ObjectLiteralExpression | null {
  const stripped = stripExpressionWrappers(expression);

  if (ts.isObjectLiteralExpression(stripped)) {
    return stripped;
  }

  if (ts.isIdentifier(stripped)) {
    const initializer = declarations.get(stripped.text);

    return initializer ? resolveObjectLiteral(initializer, declarations) : null;
  }

  return null;
}

/**
 * Removes syntactic wrappers that do not change the underlying runtime value.
 *
 * @param expression - Expression to unwrap.
 * @returns The unwrapped expression.
 */
function stripExpressionWrappers(expression: ts.Expression): ts.Expression {
  let current = expression;

  while (
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }

  return current;
}

/**
 * Builds lookup maps for declarations and functions that later resolver passes can follow.
 *
 * @param sourceFile - Source file whose declarations should be indexed.
 * @returns Resolver context used by the tag and title resolvers.
 */
function createResolverContext(sourceFile: ts.SourceFile): ResolverContext {
  const declarations = new Map<string, ts.Expression>();
  const functions = new Map<string, FunctionDefinition>();

  function collect(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      declarations.set(node.name.text, node.initializer);

      if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) {
        functions.set(node.name.text, createFunctionDefinition(node.initializer));
      }
    }

    if (ts.isFunctionDeclaration(node) && node.name) {
      functions.set(node.name.text, createFunctionDefinition(node));
    }

    ts.forEachChild(node, collect);
  }

  collect(sourceFile);

  return { declarations, functions };
}

/**
 * Captures the callable shape needed to evaluate a helper function during tag resolution.
 *
 * @param functionLike - Function-like node to describe.
 * @returns The function's parameters and returned expression.
 */
function createFunctionDefinition(functionLike: ts.FunctionLikeDeclarationBase): FunctionDefinition {
  return {
    bodyExpression: getReturnedExpression(functionLike),
    parameters: functionLike.parameters.flatMap((parameter) => {
      if (!ts.isIdentifier(parameter.name)) {
        return [];
      }

      return [{ isRest: Boolean(parameter.dotDotDotToken), name: parameter.name.text }];
    }),
  };
}

/**
 * Returns the expression produced by a function, supporting concise arrow functions and explicit return statements.
 *
 * @param functionLike - Function-like node to inspect.
 * @returns The returned expression, or `null` when it cannot be determined.
 */
function getReturnedExpression(functionLike: ts.FunctionLikeDeclarationBase): ts.Expression | null {
  if (!functionLike.body) {
    return null;
  }

  if (ts.isExpression(functionLike.body)) {
    return functionLike.body;
  }

  for (const statement of functionLike.body.statements) {
    if (ts.isReturnStatement(statement) && statement.expression) {
      return statement.expression;
    }
  }

  return null;
}

/**
 * Resolves tag lists from arrays, identifiers, helper calls, and simple conditional expressions.
 *
 * @param expression - Expression that may yield one or more tag strings.
 * @param resolverContext - Precomputed declaration and function lookup data.
 * @param sourceFile - Source file containing the expression.
 * @param seen - Identifiers already visited while resolving declaration chains.
 * @param parameterBindings - Bound argument values for helper-function parameters.
 * @param activeFunctions - Helper functions currently being evaluated to avoid recursion loops.
 * @returns The tag strings that can be resolved from the expression.
 */
function resolveTagList(
  expression: ts.Expression,
  resolverContext: ResolverContext,
  sourceFile: ts.SourceFile,
  seen: Set<string>,
  parameterBindings: Map<string, ts.Expression | ts.Expression[]>,
  activeFunctions: Set<string>,
): string[] {
  if (ts.isSpreadElement(expression)) {
    return resolveTagList(expression.expression, resolverContext, sourceFile, seen, parameterBindings, activeFunctions);
  }

  const stripped = stripExpressionWrappers(expression);

  if (ts.isStringLiteral(stripped) || ts.isNoSubstitutionTemplateLiteral(stripped)) {
    return [stripped.text];
  }

  if (ts.isArrayLiteralExpression(stripped)) {
    return stripped.elements.flatMap((element) => {
      if (ts.isSpreadElement(element)) {
        return resolveTagList(
          element.expression,
          resolverContext,
          sourceFile,
          seen,
          parameterBindings,
          activeFunctions,
        );
      }

      return resolveTagList(element, resolverContext, sourceFile, seen, parameterBindings, activeFunctions);
    });
  }

  if (ts.isIdentifier(stripped)) {
    const boundValue = parameterBindings.get(stripped.text);

    if (boundValue) {
      return Array.isArray(boundValue)
        ? boundValue.flatMap((value) =>
            resolveTagList(value, resolverContext, sourceFile, seen, parameterBindings, activeFunctions),
          )
        : resolveTagList(boundValue, resolverContext, sourceFile, seen, parameterBindings, activeFunctions);
    }

    if (seen.has(stripped.text)) {
      return [];
    }

    const initializer = resolverContext.declarations.get(stripped.text);

    if (!initializer) {
      return [];
    }

    const nextSeen = new Set(seen);
    nextSeen.add(stripped.text);

    return resolveTagList(initializer, resolverContext, sourceFile, nextSeen, parameterBindings, activeFunctions);
  }

  if (ts.isCallExpression(stripped)) {
    // Prefer resolving the helper call itself before falling back to scanning its arguments.
    const resolvedCallTags = resolveTagListFromCall(
      stripped,
      resolverContext,
      sourceFile,
      seen,
      parameterBindings,
      activeFunctions,
    );

    if (resolvedCallTags) {
      return resolvedCallTags;
    }

    return stripped.arguments.flatMap((argument) =>
      resolveTagList(argument, resolverContext, sourceFile, seen, parameterBindings, activeFunctions),
    );
  }

  if (ts.isBinaryExpression(stripped) && stripped.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const resolved = resolveStringLike(stripped, resolverContext, sourceFile, parameterBindings);

    return resolved ? [resolved] : [];
  }

  if (ts.isConditionalExpression(stripped)) {
    return [
      ...resolveTagList(stripped.whenTrue, resolverContext, sourceFile, seen, parameterBindings, activeFunctions),
      ...resolveTagList(stripped.whenFalse, resolverContext, sourceFile, seen, parameterBindings, activeFunctions),
    ];
  }

  return [];
}

/**
 * Resolves tags returned from a helper function call by binding the call arguments to the function parameters.
 *
 * @param callExpression - Helper call to evaluate.
 * @param resolverContext - Precomputed declaration and function lookup data.
 * @param sourceFile - Source file containing the call expression.
 * @param seen - Identifiers already visited while resolving declaration chains.
 * @param parameterBindings - Bound argument values inherited from outer helper calls.
 * @param activeFunctions - Helper functions currently being evaluated to avoid recursion loops.
 * @returns The resolved tags, or `null` when the call cannot be evaluated safely.
 */
function resolveTagListFromCall(
  callExpression: ts.CallExpression,
  resolverContext: ResolverContext,
  sourceFile: ts.SourceFile,
  seen: Set<string>,
  parameterBindings: Map<string, ts.Expression | ts.Expression[]>,
  activeFunctions: Set<string>,
): string[] | null {
  const functionName = getCalledFunctionName(callExpression.expression);

  if (!functionName) {
    return null;
  }

  const functionDefinition = resolverContext.functions.get(functionName);

  if (!functionDefinition?.bodyExpression || activeFunctions.has(functionName)) {
    return null;
  }

  const nextBindings = new Map(parameterBindings);

  for (let index = 0; index < functionDefinition.parameters.length; index += 1) {
    const parameter = functionDefinition.parameters[index];

    if (!parameter) {
      continue;
    }

    if (parameter.isRest) {
      nextBindings.set(parameter.name, callExpression.arguments.slice(index));
      continue;
    }

    const argument = callExpression.arguments[index];

    if (argument) {
      nextBindings.set(parameter.name, argument);
    }
  }

  const nextActiveFunctions = new Set(activeFunctions);
  nextActiveFunctions.add(functionName);

  return resolveTagList(
    functionDefinition.bodyExpression,
    resolverContext,
    sourceFile,
    seen,
    nextBindings,
    nextActiveFunctions,
  );
}

/**
 * Extracts a callable name from an identifier or property access expression.
 *
 * @param expression - Call target expression to inspect.
 * @returns The resolved function name, or `null` when it cannot be determined.
 */
function getCalledFunctionName(expression: ts.LeftHandSideExpression): string | null {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }

  return null;
}

/**
 * Resolves string-like expressions used for titles and tags, following declaration indirection where possible.
 *
 * @param expression - Expression expected to produce a string value.
 * @param resolverContext - Precomputed declaration and function lookup data.
 * @param sourceFile - Source file containing the expression.
 * @param parameterBindings - Bound argument values for helper-function parameters.
 * @param seen - Identifiers already visited while resolving declaration chains.
 * @returns The resolved string, or `null` when resolution would recurse indefinitely.
 */
function resolveStringLike(
  expression: ts.Expression,
  resolverContext: ResolverContext,
  sourceFile: ts.SourceFile,
  parameterBindings = new Map<string, ts.Expression | ts.Expression[]>(),
  seen = new Set<string>(),
): string | null {
  const stripped = stripExpressionWrappers(expression);

  if (ts.isStringLiteral(stripped) || ts.isNoSubstitutionTemplateLiteral(stripped)) {
    return stripped.text;
  }

  if (ts.isTemplateExpression(stripped)) {
    const pieces = [stripped.head.text];

    for (const span of stripped.templateSpans) {
      const resolved = resolveStringLike(span.expression, resolverContext, sourceFile, parameterBindings, seen);

      if (resolved === null) {
        return stripped.getText(sourceFile);
      }

      pieces.push(resolved, span.literal.text);
    }

    return pieces.join('');
  }

  if (ts.isIdentifier(stripped)) {
    const boundValue = parameterBindings.get(stripped.text);

    if (boundValue) {
      if (Array.isArray(boundValue)) {
        const firstBoundValue = boundValue[0];

        return boundValue.length === 1
          ? firstBoundValue
            ? resolveStringLike(firstBoundValue, resolverContext, sourceFile, parameterBindings, seen)
            : stripped.getText(sourceFile)
          : stripped.getText(sourceFile);
      }

      return resolveStringLike(boundValue, resolverContext, sourceFile, parameterBindings, seen);
    }

    if (seen.has(stripped.text)) {
      return null;
    }

    const initializer = resolverContext.declarations.get(stripped.text);

    if (!initializer) {
      return stripped.getText(sourceFile);
    }

    const nextSeen = new Set(seen);
    nextSeen.add(stripped.text);

    return resolveStringLike(initializer, resolverContext, sourceFile, parameterBindings, nextSeen);
  }

  if (ts.isBinaryExpression(stripped) && stripped.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = resolveStringLike(stripped.left, resolverContext, sourceFile, parameterBindings, seen);
    const right = resolveStringLike(stripped.right, resolverContext, sourceFile, parameterBindings, seen);

    return left !== null && right !== null ? `${left}${right}` : stripped.getText(sourceFile);
  }

  return stripped.getText(sourceFile);
}

/**
 * Converts a property name node into plain text when it uses a supported literal or identifier form.
 *
 * @param name - Property name node to inspect.
 * @returns The property name text, or `null` when the name cannot be represented plainly.
 */
function getPropertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  return null;
}

/**
 * Returns the trimmed value that follows a Gherkin keyword on the same line.
 *
 * @param line - Raw line text to inspect.
 * @param keyword - Keyword prefix that should be removed.
 * @returns The keyword value, or `undefined` when the line does not start with the keyword.
 */
function extractKeywordValue(line: string, keyword: string): string | undefined {
  if (!line.startsWith(keyword)) {
    return undefined;
  }

  return line.slice(keyword.length).trim();
}

/**
 * Removes duplicate string values while preserving first-seen order.
 *
 * @param values - Values to deduplicate.
 * @returns A deduplicated list.
 */
function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Normalizes a root directory to forward slashes and guarantees a trailing slash for prefix checks.
 *
 * @param rootDirectory - Root directory to normalize.
 * @returns The normalized root prefix.
 */
function normalizeRoot(rootDirectory: string): string {
  const normalized = rootDirectory.split(path.sep).join('/');

  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

/**
 * Chooses the TypeScript parser mode that matches the component-test file extension.
 *
 * @param filePath - Test file path whose extension determines the script kind.
 * @returns The script kind to pass into `ts.createSourceFile()`.
 */
function getScriptKind(filePath: string): ts.ScriptKind {
  if (filePath.endsWith('.cy.tsx')) {
    return ts.ScriptKind.TSX;
  }

  if (filePath.endsWith('.cy.jsx')) {
    return ts.ScriptKind.JSX;
  }

  if (filePath.endsWith('.cy.js')) {
    return ts.ScriptKind.JS;
  }

  return ts.ScriptKind.TS;
}
