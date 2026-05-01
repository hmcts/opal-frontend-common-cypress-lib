import { resolvePlaceholderEpicsInText } from '../src/metadata/placeholder-epics';

describe('placeholder Jira epic resolution', () => {
  it('replaces mapped placeholders and reports unresolved placeholders without changing them', () => {
    const result = resolvePlaceholderEpicsInText(
      [
        '@jiraEpic(PLACEHOLDER_PAYMENTS)',
        'Scenario: Pay a fine',
        '',
        '@jiraEpic(PLACEHOLDER_UNKNOWN)',
        'Scenario: View a fine',
      ].join('\n'),
      {
        PLACEHOLDER_PAYMENTS: 'OPAL-123',
      },
    );

    expect(result.text).toContain('@jiraEpic(OPAL-123)');
    expect(result.text).toContain('@jiraEpic(PLACEHOLDER_UNKNOWN)');
    expect(result.replacements).toEqual([
      {
        from: 'PLACEHOLDER_PAYMENTS',
        line: 1,
        to: 'OPAL-123',
      },
    ]);
    expect(result.unresolved).toEqual([
      {
        placeholder: 'PLACEHOLDER_UNKNOWN',
        line: 4,
      },
    ]);
  });
});
