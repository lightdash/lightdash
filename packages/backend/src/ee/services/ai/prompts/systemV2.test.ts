import { getSystemPromptV2 } from './systemV2';

const promptText = (args: Parameters<typeof getSystemPromptV2>[0]): string => {
    const { content } = getSystemPromptV2(args);
    return typeof content === 'string' ? content : JSON.stringify(content);
};

describe('getSystemPromptV2 project context', () => {
    test('advertises the loadProjectContext tool when context exists', () => {
        const content = promptText({
            availableExplores: [],
            hasProjectContext: true,
        });
        expect(content).toContain('## Project context');
        expect(content).toContain('loadProjectContext');
        expect(content).toContain('BEFORE');
    });

    test('shows a placeholder when no project context is configured', () => {
        const content = promptText({
            availableExplores: [],
            hasProjectContext: false,
        });
        expect(content).toContain(
            'No project context has been configured for this project.',
        );
        expect(content).not.toContain('loadProjectContext');
    });

    test('leaves no unfilled project_context placeholder', () => {
        const content = promptText({ availableExplores: [] });
        expect(content).not.toContain('{{project_context}}');
    });
});

describe('getSystemPromptV2 writeback attribution', () => {
    test('omits the writeback section entirely when writeback is disabled', () => {
        const content = promptText({
            availableExplores: [],
            enableAiWriteback: false,
            writebackAttribution: { mode: 'org', canLink: true },
            siteUrl: 'https://app.lightdash.cloud',
        });
        expect(content).not.toContain('## Repository writeback');
        expect(content).not.toContain('Pull request attribution');
    });

    test('includes the base section but no attribution block when attribution is null', () => {
        const content = promptText({
            availableExplores: [],
            enableAiWriteback: true,
            writebackAttribution: null,
            siteUrl: 'https://app.lightdash.cloud',
        });
        expect(content).toContain('## Repository writeback');
        expect(content).not.toContain('Pull request attribution');
    });

    test('nudges unlinked users who can link, with an absolute settings link', () => {
        const content = promptText({
            availableExplores: [],
            enableAiWriteback: true,
            writebackAttribution: { mode: 'org', canLink: true },
            siteUrl: 'https://app.lightdash.cloud',
        });
        expect(content).toContain('Pull request attribution');
        expect(content).toContain('not** linked a personal GitHub account');
        expect(content).toContain(
            'https://app.lightdash.cloud/generalSettings/profile',
        );
        expect(content).toContain('at most once per thread');
    });

    test('does not duplicate slashes in the settings link when siteUrl has a trailing slash', () => {
        const content = promptText({
            availableExplores: [],
            enableAiWriteback: true,
            writebackAttribution: { mode: 'org', canLink: true },
            siteUrl: 'https://app.lightdash.cloud/',
        });
        expect(content).toContain(
            'https://app.lightdash.cloud/generalSettings/profile',
        );
        expect(content).not.toContain('cloud//generalSettings');
    });

    test('does not nudge or deep-link when the user cannot link', () => {
        const content = promptText({
            availableExplores: [],
            enableAiWriteback: true,
            writebackAttribution: { mode: 'org', canLink: false },
            siteUrl: 'https://app.lightdash.cloud',
        });
        expect(content).toContain('Pull request attribution');
        expect(content).toContain('shared organization-level Lightdash GitHub');
        expect(content).not.toContain('/generalSettings/profile');
    });

    test('states personal attribution without nudging when the user has linked', () => {
        const content = promptText({
            availableExplores: [],
            enableAiWriteback: true,
            writebackAttribution: {
                mode: 'personal',
                githubLogin: 'octocat',
            },
            siteUrl: 'https://app.lightdash.cloud',
        });
        expect(content).toContain('Pull request attribution');
        expect(content).toContain('@octocat');
        expect(content).not.toContain('/generalSettings/profile');
    });
});
