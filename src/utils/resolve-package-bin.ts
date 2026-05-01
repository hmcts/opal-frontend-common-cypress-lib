import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

export function resolvePackageBin(cwd: string, packageName: string, binName: string): string {
  const localBin = path.join(cwd, 'node_modules', '.bin', process.platform === 'win32' ? `${binName}.cmd` : binName);

  if (fs.existsSync(localBin)) {
    return localBin;
  }

  const requireFromConsumer = createRequire(path.join(cwd, 'package.json'));

  try {
    const packageJsonPath = requireFromConsumer.resolve(`${packageName}/package.json`);
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      bin?: Record<string, string> | string;
    };
    const binEntry = typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.[binName];

    if (binEntry === undefined) {
      throw new Error(`Package ${packageName} does not expose a ${binName} binary.`);
    }

    return path.resolve(path.dirname(packageJsonPath), binEntry);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Unable to resolve ${binName} from ${cwd}. Install ${packageName} in the consuming project. ${message}`,
    );
  }
}
