import { spawn } from 'node:child_process';
import { RunnerCommand } from '../runner/runner-arguments';
import { resolvePackageBin } from './resolve-package-bin';

export async function runPackageCommand(command: RunnerCommand): Promise<number> {
  if (command.dryRun) {
    console.log(renderCommand(command.binName, command.args));
    return 0;
  }

  const binPath = resolvePackageBin(command.cwd, command.packageName, command.binName);

  return run(binPath, command.args, command.cwd, command.env);
}

export async function run(
  command: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
  stdio: 'inherit' | 'pipe' = 'inherit',
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...env,
      },
      shell: process.platform === 'win32',
      stdio,
    });

    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

export function renderCommand(command: string, args: string[]): string {
  return [command, ...args].map(quoteShellToken).join(' ');
}

function quoteShellToken(token: string): string {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(token)) {
    return token;
  }

  return `'${token.replaceAll("'", "'\\''")}'`;
}
