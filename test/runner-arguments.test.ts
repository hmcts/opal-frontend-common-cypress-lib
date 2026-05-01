import { buildRunnerCommand, parseRunnerArgs } from '../src/runner/runner-arguments';

describe('runner argument parsing', () => {
  it('parses suite, browser, headed mode, parallel settings, and Cypress passthrough args', () => {
    const parsed = parseRunnerArgs([
      'functional',
      '--browser',
      'chrome',
      '--headed',
      '--parallel',
      '--threads',
      '4',
      '--spec',
      'cypress/e2e/**/*.feature',
      '--',
      '--config',
      'baseUrl=http://localhost:4200',
    ]);

    expect(parsed).toMatchObject({
      suite: 'functional',
      browser: 'chrome',
      headed: true,
      parallel: true,
      threads: 4,
      spec: 'cypress/e2e/**/*.feature',
      cypressArgs: ['--config', 'baseUrl=http://localhost:4200'],
    });
  });

  it('keeps runner output rooted in the consuming project', () => {
    const command = buildRunnerCommand(
      parseRunnerArgs(['smoke', '--browser=electron', '--dry-run']),
      '/consumer/project',
    );

    expect(command.cwd).toBe('/consumer/project');
    expect(command.args).toContain('--browser');
    expect(command.args).toContain('electron');
    expect(command.env.OPAL_CYPRESS_SUITE).toBe('smoke');
    expect(command.env.OPAL_CYPRESS_OUTPUT_DIR).toBe('/consumer/project/smoke-output');
  });
});
