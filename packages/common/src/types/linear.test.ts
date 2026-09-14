import { getLinearIssueIdentifier } from './linear';

describe('getLinearIssueIdentifier', () => {
    it('reads the identifier from a Linear issue URL', () => {
        expect(
            getLinearIssueIdentifier(
                'https://linear.app/acme/issue/PRD-12/broken-metric',
            ),
        ).toBe('PRD-12');
    });

    it('returns null for a non-Linear URL', () => {
        expect(
            getLinearIssueIdentifier('https://github.com/acme/repo/issues/12'),
        ).toBeNull();
    });

    it('returns null for an invalid URL', () => {
        expect(getLinearIssueIdentifier('not-a-url')).toBeNull();
    });
});
