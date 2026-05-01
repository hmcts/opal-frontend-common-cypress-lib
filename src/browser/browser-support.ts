import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

export const browserChrome = 'chrome';
export const browserEdge = 'edge';
export const browserFirefox = 'firefox';
export const defaultBrowser = browserEdge;

const browserChecks: Record<string, { commands: string[]; executablePaths: string[] }> = {
  [browserChrome]: {
    commands: ['google-chrome', 'google-chrome-stable', 'chrome'],
    executablePaths: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
  },
  [browserEdge]: {
    commands: ['microsoft-edge', 'microsoft-edge-stable', 'msedge'],
    executablePaths: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
  },
  [browserFirefox]: {
    commands: ['firefox', 'firefox-bin'],
    executablePaths: ['/Applications/Firefox.app/Contents/MacOS/firefox'],
  },
};

export function normalizeBrowser(browser: string | undefined | null): string {
  return String(browser || '')
    .trim()
    .toLowerCase();
}

export function isBrowserInstalled(browser: string): boolean {
  const normalizedBrowser = normalizeBrowser(browser);
  const checks = browserChecks[normalizedBrowser];

  if (checks === undefined) {
    return false;
  }

  return checks.commands.some(hasCommand) || checks.executablePaths.some(isExecutable);
}

export function requireInstalledBrowser(browser: string): string {
  const normalizedBrowser = normalizeBrowser(browser);

  if (!isSupportedBrowser(normalizedBrowser)) {
    throw new Error(formatBanner([`UNSUPPORTED BROWSER REQUESTED: ${normalizedBrowser || '(empty)'}`]));
  }

  if (!isBrowserInstalled(normalizedBrowser)) {
    throw new Error(
      formatBanner([
        `${normalizedBrowser.toUpperCase()} IS NOT INSTALLED ON THIS MACHINE`,
        `INSTALL ${normalizedBrowser.toUpperCase()} OR USE A DIFFERENT BROWSER`,
      ]),
    );
  }

  return normalizedBrowser;
}

export function resolveGenericBrowser(browser: string | undefined | null): string {
  const requestedBrowser = normalizeBrowser(browser) || defaultBrowser;

  if (!isSupportedBrowser(requestedBrowser)) {
    throw new Error(formatBanner([`UNSUPPORTED BROWSER REQUESTED: ${requestedBrowser}`]));
  }

  if (requestedBrowser === browserEdge) {
    if (isBrowserInstalled(browserEdge)) {
      return browserEdge;
    }

    if (isBrowserInstalled(browserChrome)) {
      console.error(formatBanner(['EDGE IS NOT INSTALLED ON THIS MACHINE', 'SWITCHING TO CHROME FOR THIS RUN']));
      return browserChrome;
    }

    throw new Error(
      formatBanner(['EDGE IS NOT INSTALLED ON THIS MACHINE', 'CHROME IS ALSO NOT AVAILABLE AS A FALLBACK']),
    );
  }

  return requireInstalledBrowser(requestedBrowser);
}

function formatBanner(lines: string[]): string {
  const divider = '========================================================================';
  return [divider, ...lines, divider].join('\n');
}

function hasCommand(commandName: string): boolean {
  const lookupCommand = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(lookupCommand, [commandName], { stdio: 'ignore' }).status === 0;
}

function isExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function isSupportedBrowser(browser: string): boolean {
  return Object.hasOwn(browserChecks, browser);
}
