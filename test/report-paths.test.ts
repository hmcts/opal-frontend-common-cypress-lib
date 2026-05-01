import { resolveReportPaths } from '../src/reports/report-paths';

describe('report path resolution', () => {
  it('defaults functional reports to functional-output under the consuming repository', () => {
    const paths = resolveReportPaths({ cwd: '/consumer/project', suite: 'functional' });

    expect(paths.outputDir).toBe('/consumer/project/functional-output');
    expect(paths.mochawesomePattern).toBe('/consumer/project/functional-output/**/*.json');
    expect(paths.mergedJson).toBe('/consumer/project/functional-output/mochawesome.json');
    expect(paths.htmlDir).toBe('/consumer/project/functional-output/html');
    expect(paths.junitMergedXml).toBe('/consumer/project/functional-output/junit/results.xml');
  });

  it('defaults smoke reports to smoke-output and accepts explicit output directories', () => {
    expect(resolveReportPaths({ cwd: '/consumer/project', suite: 'smoke' }).outputDir).toBe(
      '/consumer/project/smoke-output',
    );

    expect(
      resolveReportPaths({
        cwd: '/consumer/project',
        outputDir: 'reports/component',
        suite: 'component',
      }).outputDir,
    ).toBe('/consumer/project/reports/component');
  });
});
