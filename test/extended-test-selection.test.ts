import { spawnSync } from 'node:child_process';
import { runOpalSuite } from '../src/runner/opal-suite-runner';
import { applyExtendedTestSelection } from '../src/runner/extended-test-selection';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn(() => ({ status: 0 })) }));
vi.mock('../src/browser/browser-support', () => ({
  normalizeBrowser: (browser: string) => browser,
  requireInstalledBrowser: (browser: string) => browser,
  resolveGenericBrowser: () => 'chrome',
}));
vi.mock('../src/utils/resolve-package-bin', () => ({
  resolvePackageBin: (_cwd: string, _package: string, bin: string) => bin,
}));

const marker = '__opalExcludeExtendedTests';
const launch = (suite: string, env: NodeJS.ProcessEnv = {}, args: string[] = []) => {
  vi.mocked(spawnSync).mockClear();
  const original = { ...env };
  expect(runOpalSuite([suite, '--serial', '--no-reset', '--no-reports', ...args], '/consumer', env)).toBe(0);
  expect(env).toEqual(original);
  const call = vi.mocked(spawnSync).mock.calls.at(-1)!;
  return { args: call[1] as string[], env: (call[2] as { env: NodeJS.ProcessEnv }).env };
};
const values = (args: string[], flag: string): Record<string, unknown> => {
  const index = args.indexOf(flag);
  return index < 0 ? {} : JSON.parse(args[index + 1]!);
};
const resolved = (suite: string, env: Record<string, unknown> = {}, expose: Record<string, unknown> = {}) => ({
  testingType: suite === 'functional' ? 'e2e' : 'component',
  env,
  expose,
});

describe('runner CLI selection preparation', () => {
  it.each([undefined, 'false'])('leaves local, opted-in and nightly options unchanged (%s)', (flag) => {
    for (const suite of ['functional', 'component']) {
      const result = launch(suite, { EXCLUDE_EXTENDED_TESTS: flag }, ['--env', 'keep=true']);
      expect(result.args.slice(-2)).toEqual(['--env', 'keep=true']);
      expect(result.args).not.toContain('--expose');
    }
  });

  it.each(['functional', 'component'])('marks %s launches without overriding configured selectors', (suite) => {
    const result = launch(suite, { EXCLUDE_EXTENDED_TESTS: 'true' });
    expect(values(result.args, '--env')).toEqual({ [marker]: true });
    expect(result.args).not.toContain('--expose');
  });

  it.each(['functional', 'component'])('preserves nested, quoted and dotted %s values', (suite) => {
    const flag = suite === 'functional' ? '--env' : '--expose';
    const selector = suite === 'functional' ? 'TAGS' : 'grepTags';
    const payload = {
      query: 'x,mode=test',
      nested: [{ text: 'brackets } ],mode=keep', quote: 'a "quote",mode=keep', path: 'a\\b' }],
    };
    const message = 'quoted "text",mode=keep';
    const items = ['x,mode=test', { value: 'x,api.url=keep' }];
    const result = launch(suite, { EXCLUDE_EXTENDED_TESTS: 'true' }, [
      flag,
      `payload=${JSON.stringify(payload)},message=${JSON.stringify(message)},items=${JSON.stringify(items)},${selector}=@release,api.url=https://example.test`,
    ]);
    expect(values(result.args, flag)).toEqual({
      payload,
      message,
      items,
      [selector]: '@release',
      'api.url': 'https://example.test',
      ...(suite === 'functional' ? { [marker]: true } : {}),
    });
  });

  it.each(['functional', 'component'])('honours later aliases, reverse aliases and empty %s overrides', (suite) => {
    const flag = suite === 'functional' ? '--env' : '--expose';
    const short = suite === 'functional' ? '-e' : '-x';
    const canonical = suite === 'functional' ? 'TAGS' : 'grepTags';
    const alias = suite === 'functional' ? 'tags' : 'grep-tags';
    for (const [first, last] of [
      [canonical, alias],
      [alias, canonical],
    ]) {
      for (const selection of ['@release', '']) {
        const result = launch(suite, { EXCLUDE_EXTENDED_TESTS: 'true' }, [
          flag,
          `${first}=@initial,keep=true`,
          short,
          `${last}=${selection},count=2`,
        ]);
        const selected = values(result.args, flag);
        expect(selected[canonical]).toBe(selection);
        expect(selected).not.toHaveProperty(alias!);
        expect(selected.keep).toBe(true);
        expect(selected.count).toBe(2);
        expect(result.args).not.toContain(short);
      }
    }
  });

  it.each(['functional', 'component'])('supports equals-form short %s options', (suite) => {
    const flag = suite === 'functional' ? '--env' : '--expose';
    const short = suite === 'functional' ? '-e' : '-x';
    const selector = suite === 'functional' ? 'TAGS' : 'grepTags';
    const result = launch(suite, { EXCLUDE_EXTENDED_TESTS: 'true' }, [`${short}=${selector}=@release,keep=true`]);
    expect(values(result.args, flag)[selector]).toBe('@release');
    expect(values(result.args, flag).keep).toBe(true);
    expect(result.args.some((arg) => arg.startsWith(`${short}=`))).toBe(false);
  });

  it('lets a component CLI alias override inherited canonical selectors, including empty selections', () => {
    const inherited = launch('component', {
      EXCLUDE_EXTENDED_TESTS: 'true',
      CYPRESS_EXPOSE: '{"grepTags":"@initial","grep-tags":"@fallback"}',
    });
    expect(values(inherited.args, '--expose')).toEqual({ grepTags: '@initial' });
    for (const selection of ['@release', '']) {
      const result = launch(
        'component',
        { EXCLUDE_EXTENDED_TESTS: 'true', CYPRESS_EXPOSE: '{"grepTags":"@initial","keep":true}' },
        ['--expose', `grep-tags=${selection}`],
      );
      expect(values(result.args, '--expose')).toEqual({ grepTags: selection, keep: true });
    }
  });

  it('preserves explicit CLI and environment precedence, including empty environment overrides', () => {
    const result = launch('functional', { EXCLUDE_EXTENDED_TESTS: 'true', CYPRESS_TAGS: '@env', TAGS: '@default' }, [
      '--env',
      'tags=@cli',
    ]);
    expect(values(result.args, '--env').TAGS).toBe('@cli');
    const empty = launch('functional', { EXCLUDE_EXTENDED_TESTS: 'true', CYPRESS_TAGS: '', TAGS: '@default' });
    expect(values(empty.args, '--env').TAGS).toBe('');
    const lowercase = launch('functional', {
      EXCLUDE_EXTENDED_TESTS: 'true',
      CYPRESS_tags: '@lower',
      TAGS: '@default',
    });
    expect(values(lowercase.args, '--env').TAGS).toBe('@lower');
  });

  it('preserves component OR tag commas and dotted option names', () => {
    const result = launch('component', { EXCLUDE_EXTENDED_TESTS: 'true' }, [
      '--expose',
      'grep-tags=@R1A,@R1B,api.url=https://example.test',
    ]);
    expect(values(result.args, '--expose')).toEqual({ grepTags: '@R1A,@R1B', 'api.url': 'https://example.test' });
  });

  it('passes the unmodified selection and policy to parallel leaf runners', () => {
    vi.mocked(spawnSync).mockClear();
    expect(
      runOpalSuite(['functional', '--parallel', '--no-reset', '--no-reports'], '/consumer', {
        EXCLUDE_EXTENDED_TESTS: 'true',
        TAGS: '@release',
      }),
    ).toBe(0);
    const call = vi.mocked(spawnSync).mock.calls.at(-1)!;
    expect(call[0]).toBe('cypress-parallel');
    const env = (call[2] as { env: NodeJS.ProcessEnv }).env;
    expect(env.EXCLUDE_EXTENDED_TESTS).toBe('true');
    expect(env.TAGS).toBe('@release');
    expect(values(launch('functional', env).args, '--env')).toEqual({ TAGS: '@release', [marker]: true });
  });

  it('leaves smoke selection unchanged', () => {
    const result = launch('smoke', { EXCLUDE_EXTENDED_TESTS: 'true', TAGS: '@smoke' });
    expect(result.args).not.toContain('--env');
    expect(result.env.TAGS).toBe('@smoke');
  });
});

describe('resolved Cypress selection policy', () => {
  it.each(['functional', 'component'])('preserves direct %s config despite the pipeline environment flag', (suite) => {
    vi.stubEnv('EXCLUDE_EXTENDED_TESTS', 'true');
    try {
      const config = resolved(suite, { TAGS: '@release', tags: '@alias' }, { grepTags: '@release' });
      const original = structuredClone(config);
      applyExtendedTestSelection(config);
      expect(config).toEqual(original);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('composes exclusion with configuration-defined functional tags and rewrites both aliases', () => {
    const config = resolved('functional', { [marker]: true, TAGS: '(@R1A or @R1B) and not @skip', keep: true });
    applyExtendedTestSelection(config);
    expect(config.env).toEqual({
      TAGS: '((@R1A or @R1B) and not @skip) and not @extendedTest',
      tags: '((@R1A or @R1B) and not @skip) and not @extendedTest',
      keep: true,
    });
    const applied = structuredClone(config);
    applyExtendedTestSelection(config);
    expect(config).toEqual(applied);
  });

  it('enforces exclusion for lowercase-only configured functional tags', () => {
    const config = resolved('functional', { [marker]: true, tags: '@release' });
    applyExtendedTestSelection(config);
    expect(config.env.TAGS).toBe('(@release) and not @extendedTest');
    expect(config.env.tags).toBe(config.env.TAGS);
  });

  it('composes exclusion with configured component OR selectors and rewrites both aliases', () => {
    const config = resolved('component', { [marker]: true }, { grepTags: '@R1A+-@off @R1B', keep: true });
    applyExtendedTestSelection(config);
    expect(config.expose).toEqual({
      grepTags: '@R1A+-@off @R1B --@extendedTest',
      'grep-tags': '@R1A+-@off @R1B --@extendedTest',
      keep: true,
      grepOmitFiltered: true,
      grepFilterSpecs: false,
    });
  });

  it.each(['functional', 'component'])(
    'keeps CLI overrides above configured %s selectors through composition',
    (suite) => {
      const flag = suite === 'functional' ? '--env' : '--expose';
      const alias = suite === 'functional' ? 'tags' : 'grep-tags';
      for (const selected of ['@cli', '']) {
        const launched = launch(suite, { EXCLUDE_EXTENDED_TESTS: 'true' }, [flag, `${alias}=${selected}`]);
        const config = resolved(
          suite,
          { TAGS: '@configured', tags: '@configuredAlias', ...values(launched.args, '--env') },
          { grepTags: '@configured', 'grep-tags': '@configuredAlias', ...values(launched.args, '--expose') },
        );
        applyExtendedTestSelection(config);
        if (suite === 'functional') {
          expect(config.env.TAGS).toBe(selected ? `(${selected}) and not @extendedTest` : 'not @extendedTest');
          expect(config.env.tags).toBe(config.env.TAGS);
        } else {
          expect(config.expose.grepTags).toBe(`${selected} --@extendedTest`.trim());
          expect(config.expose['grep-tags']).toBe(config.expose.grepTags);
        }
      }
    },
  );
});
