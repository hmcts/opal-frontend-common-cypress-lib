import { TestMetadata } from './extract-test-metadata';

export function findTestsMissingEpic(tests: TestMetadata[]): TestMetadata[] {
  return tests.filter((test) => test.epics.length === 0 && test.placeholders.length === 0);
}

export function findTestsWithMultipleEpics(tests: TestMetadata[]): TestMetadata[] {
  return tests.filter((test) => test.epics.length > 1);
}

export function findTestsWithPlaceholderEpics(tests: TestMetadata[]): TestMetadata[] {
  return tests.filter((test) => test.placeholders.length > 0);
}

export function formatMetadataRows(tests: TestMetadata[]): string {
  if (tests.length === 0) {
    return 'No matching Cypress tests found.';
  }

  return tests
    .map((test) => {
      const metadata = test.epics.length > 0 ? test.epics.join(', ') : test.placeholders.join(', ') || 'none';
      return `${test.file}:${test.line} ${test.name} [${metadata}]`;
    })
    .join('\n');
}
