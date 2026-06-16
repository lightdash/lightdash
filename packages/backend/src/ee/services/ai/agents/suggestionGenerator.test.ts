import { buildSuggestionSystemPrompt } from './suggestionGenerator';

describe('buildSuggestionSystemPrompt', () => {
    it('appends the no-content-edit rule when the agent cannot manage content', () => {
        const postResponse = buildSuggestionSystemPrompt({
            isPostResponse: true,
            canManageContent: false,
        });
        const emptyState = buildSuggestionSystemPrompt({
            isPostResponse: false,
            canManageContent: false,
        });

        expect(postResponse).toContain('CAPABILITY LIMIT');
        expect(postResponse).toContain('CANNOT manage Lightdash content');
        expect(emptyState).toContain('CAPABILITY LIMIT');
    });

    it('omits the no-content-edit rule when the agent can manage content', () => {
        const postResponse = buildSuggestionSystemPrompt({
            isPostResponse: true,
            canManageContent: true,
        });
        const emptyState = buildSuggestionSystemPrompt({
            isPostResponse: false,
            canManageContent: true,
        });

        expect(postResponse).not.toContain('CAPABILITY LIMIT');
        expect(emptyState).not.toContain('CAPABILITY LIMIT');
    });

    it('selects the post-response vs empty-state base prompt', () => {
        const postResponse = buildSuggestionSystemPrompt({
            isPostResponse: true,
            canManageContent: true,
        });
        const emptyState = buildSuggestionSystemPrompt({
            isPostResponse: false,
            canManageContent: true,
        });

        expect(postResponse).toContain('AFTER the agent has just replied');
        expect(emptyState).toContain('starter "chips"');
    });
});
