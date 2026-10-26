import { spawnSync } from 'node:child_process';
import { runOpalSuite } from '../src/runner/opal-suite-runner';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0 })),
}));
vi.mock('../src/browser/browser-support', () => ({
  normalizeBrowser: (browser: string) => browser,
  requireInstalledBrowser: (browser: string) => browser,
  resolveGenericBrowser: () => 'chrome',
}));
vi.mock('../src/utils/resolve-package-bin', () => ({
  resolvePackageBin: (_cwd: string, _package: string, bin: string) => bin,
}));

const launch = (suite: string, env: NodeJS.ProcessEnv = {}, args: string[] = []) => {
  vi.mocked(spawnSync).mockClear();
  const original = { ...env };
  expect(runOpalSuite([suite, '--serial', '--no-reset', '--no-reports', ...args], '/consumer', env)).toBe(0);
  expect(env).toEqual(original);
  const call = vi.mocked(spawnSync).mock.calls.at(-1)!;
  return {
    args: call[1] as string[],
    env: (call[2] as { env: NodeJS.ProcessEnv }).env,
  };
};

const values = (args: string[], flag: string) => JSON.parse(args[args.indexOf(flag) + 1]!);

describe('runner extended-test policy', () => {
  it.each([undefined, 'false'])('keeps local, opted-in and nightly runs unchanged (%s)', (flag) => {
    for (const suite of ['functional', 'component']) {
      const result = launch(suite, {
        EXCLUDE_EXTENDED_TESTS: flag,
        TAGS: '@release',
      });
      expect(result.args).not.toContain('--env');
      expect(result.args).not.toContain('--expose');
      expect(result.env.TAGS).toBe('@release');
    }
  });

  it('combines functional OR, release and skip filters without mutating the parent environment', () => {
    const result = launch('functional', {
      EXCLUDE_EXTENDED_TESTS: 'true',
      CYPRESS_TAGS: '(@R1A or @R1B) and not @skip',
      TAGS: '@different',
    });
    expect(values(result.args, '--env').TAGS).toBe('((@R1A or @R1B) and not @skip) and not @extendedTest');
    expect(result.env.CYPRESS_TAGS).toBe(result.env.TAGS);
  });

  it('respects CLI tag precedence and preserves unrelated options in key=value and JSON forms', () => {
    const result = launch('functional', { EXCLUDE_EXTENDED_TESTS: 'true', TAGS: '@default' }, [
      '--env=keep=true,TAGS=@extendedTest',
      '--env',
      '{"count":2,"nested":{"value":[1,2]}}',
    ]);
    expect(values(result.args, '--env')).toEqual({
      keep: true,
      count: 2,
      nested: { value: [1, 2] },
      TAGS: '(@extendedTest) and not @extendedTest',
    });
    expect(result.args.filter((arg) => arg === '--env')).toHaveLength(1);
  });

  it('preserves dotted functional option names alongside the tag selector', () => {
    const result = launch('functional', { EXCLUDE_EXTENDED_TESTS: 'true' }, [
      '--env',
      'TAGS=@release,api.url=https://example.test,api.enabled=true',
    ]);
    expect(values(result.args, '--env')).toEqual({
      TAGS: '(@release) and not @extendedTest',
      'api.url': 'https://example.test',
      'api.enabled': true,
    });
  });

  it('preserves dotted expose option names and comma-separated component tag selections', () => {
    const result = launch('component', { EXCLUDE_EXTENDED_TESTS: 'true' }, [
      '--expose',
      'grepTags=@R1A,@R1B,api.url=https://example.test,api.enabled=true',
    ]);
    expect(values(result.args, '--expose')).toEqual({
      grepTags: '@R1A,@R1B --@extendedTest',
      'api.url': 'https://example.test',
      'api.enabled': true,
      grepOmitFiltered: true,
      grepFilterSpecs: false,
    });
  });

  it('excludes extended functional tests when no tag selection was supplied', () => {
    expect(values(launch('functional', { EXCLUDE_EXTENDED_TESTS: 'true' }).args, '--env').TAGS).toBe(
      'not @extendedTest',
    );
  });

  it('preserves component OR selections, aliases and unrelated expose values', () => {
    const result = launch('component', { EXCLUDE_EXTENDED_TESTS: 'true', CYPRESS_EXPOSE: '{"keep":true}' }, [
      '--expose',
      'grep-tags=@R1A,@R1B,grepFilterSpecs=true',
    ]);
    expect(values(result.args, '--expose')).toEqual({
      keep: true,
      'grep-tags': '@R1A,@R1B',
      grepTags: '@R1A,@R1B --@extendedTest',
      grepOmitFiltered: true,
      grepFilterSpecs: false,
    });
  });

  it.each([
    ['grep-tags', '@R1B'],
    ['grepTags', '@R1B'],
    ['grep-tags', ''],
    ['grepTags', ''],
  ])('gives CLI %s=%s precedence over inherited component selectors', (key, selection) => {
    const result = launch(
      'component',
      {
        EXCLUDE_EXTENDED_TESTS: 'true',
        CYPRESS_EXPOSE: '{"grepTags":"@R1A","grep-tags":"@fallback","keep":true}',
      },
      ['--expose', `${key}=${selection}`],
    );
    const expose = values(result.args, '--expose');
    expect(expose.grepTags).toBe(`${selection} --@extendedTest`.trim());
    expect(expose.keep).toBe(true);
  });

  it.each([['-e', 'TAGS=@release,keep=true'], ['-e=TAGS=@release,keep=true']])(
    'preserves short functional options %j',
    (...args) => {
      const result = launch('functional', { EXCLUDE_EXTENDED_TESTS: 'true', TAGS: '@default' }, args);
      expect(values(result.args, '--env')).toEqual({ TAGS: '(@release) and not @extendedTest', keep: true });
      expect(result.args).not.toContain('-e');
      expect(result.args.some((arg) => arg.startsWith('-e='))).toBe(false);
    },
  );

  it('merges mixed short and long functional options in CLI order', () => {
    const result = launch('functional', { EXCLUDE_EXTENDED_TESTS: 'true' }, [
      '--env',
      'TAGS=@initial,keep=true',
      '-e',
      'TAGS=@release,count=2',
    ]);
    expect(values(result.args, '--env')).toEqual({ TAGS: '(@release) and not @extendedTest', keep: true, count: 2 });
  });

  it.each([['-x', 'grep-tags=@R1B,keep=true'], ['-x=grep-tags=@R1B,keep=true']])(
    'preserves short component options %j',
    (...args) => {
      const result = launch(
        'component',
        {
          EXCLUDE_EXTENDED_TESTS: 'true',
          CYPRESS_EXPOSE: '{"grepTags":"@R1A"}',
        },
        args,
      );
      const expose = values(result.args, '--expose');
      expect(expose.grepTags).toBe('@R1B --@extendedTest');
      expect(expose.keep).toBe(true);
      expect(result.args).not.toContain('-x');
      expect(result.args.some((arg) => arg.startsWith('-x='))).toBe(false);
    },
  );

  it('excludes extended components without requiring a consumer config hook', () => {
    expect(values(launch('component', { EXCLUDE_EXTENDED_TESTS: 'true' }).args, '--expose')).toEqual({
      grepTags: '--@extendedTest',
      grepOmitFiltered: true,
      grepFilterSpecs: false,
    });
  });

  it('does not apply the functional/component exclusion to smoke tests', () => {
    const result = launch('smoke', {
      EXCLUDE_EXTENDED_TESTS: 'true',
      TAGS: '@smoke',
    });
    expect(result.env.TAGS).toBe('@smoke');
    expect(result.args).not.toContain('--env');
  });

  it('passes the policy through parallel scheduling for the serial leaf runner to apply', () => {
    vi.mocked(spawnSync).mockClear();
    expect(
      runOpalSuite(['functional', '--parallel', '--no-reset', '--no-reports'], '/consumer', {
        EXCLUDE_EXTENDED_TESTS: 'true',
        TAGS: '@R1A',
      }),
    ).toBe(0);
    const call = vi.mocked(spawnSync).mock.calls.at(-1)!;
    expect(call[0]).toBe('cypress-parallel');
    const childEnv = (call[2] as { env: NodeJS.ProcessEnv }).env;
    expect(childEnv.EXCLUDE_EXTENDED_TESTS).toBe('true');
    expect(childEnv.TAGS).toBe('@R1A');
    const result = launch('functional', childEnv);
    expect(values(result.args, '--env').TAGS).toBe('(@R1A) and not @extendedTest');
  });
});
