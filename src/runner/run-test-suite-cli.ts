import { runOpalSuite } from './opal-suite-runner';

export async function runTestSuiteCli(argv = process.argv.slice(2), cwd = process.cwd()): Promise<number> {
  return runOpalSuite(argv, cwd);
}
