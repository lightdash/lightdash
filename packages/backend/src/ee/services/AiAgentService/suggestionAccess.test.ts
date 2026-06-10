import { canGeneratePostResponseSuggestions } from './suggestionAccess';

describe('canGeneratePostResponseSuggestions', () => {
    it('allows owned web app threads', () => {
        expect(
            canGeneratePostResponseSuggestions('user-1', {
                createdFrom: 'web_app',
                user: { uuid: 'user-1' },
            }),
        ).toBe(true);
    });

    it('blocks shared threads owned by another user', () => {
        expect(
            canGeneratePostResponseSuggestions('user-1', {
                createdFrom: 'web_app',
                user: { uuid: 'user-2' },
            }),
        ).toBe(false);
    });

    it('blocks Slack threads', () => {
        expect(
            canGeneratePostResponseSuggestions('user-1', {
                createdFrom: 'slack',
                user: { uuid: 'user-1' },
            }),
        ).toBe(false);
    });
});
