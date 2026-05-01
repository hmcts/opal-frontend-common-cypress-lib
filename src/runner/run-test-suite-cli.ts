import { buildRunnerCommand, parseRunnerArgs } from './runner-arguments';
import { runPackageCommand } from '../utils/run-command';

export async function runTestSuiteCli(argv = process.argv.slice(2), cwd = process.cwd()): Promise<number> {
  const options = parseRunnerArgs(argv);
  const command = buildRunnerCommand(options, cwd);
  return runPackageCommand(command);
}
