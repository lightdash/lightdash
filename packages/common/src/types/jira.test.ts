import { getJiraIssueIdentifier } from './jira';

describe('getJiraIssueIdentifier', () => {
    it('reads an issue key from a Jira browse URL', () => {
        expect(
            getJiraIssueIdentifier('https://acme.atlassian.net/browse/DATA-42'),
        ).toBe('DATA-42');
    });

    it('returns null for invalid and non-issue URLs', () => {
        expect(getJiraIssueIdentifier('not-a-url')).toBeNull();
        expect(
            getJiraIssueIdentifier('https://acme.atlassian.net/projects/DATA'),
        ).toBeNull();
    });
});
