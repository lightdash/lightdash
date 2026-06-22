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

describe('getSystemPromptV2 MCP connections', () => {
    test('lists unauthenticated MCP server login status', () => {
        const content = promptText({
            availableExplores: [],
            unauthenticatedMcpServerNames: ['Linear'],
        });

        expect(content).toContain('## MCP connections');
        expect(content).toContain(
            'Linear MCP connection is setup, but the current user is not logged in',
        );
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
        // Reminder must fire at offer/suggest time (so the user can link before
        // the first PR), and stay capped at once per thread.
        expect(content).toContain('offer or suggest');
        expect(content).toContain('once per thread');
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

describe('getSystemPromptV2 change-validation policy', () => {
    const writebackArgs = {
        availableExplores: [],
        enableAiWriteback: true,
        writebackAttribution: null,
        siteUrl: 'https://app.lightdash.cloud',
    };

    test('requires validating a value-affecting change before calling it safe', () => {
        const content = promptText(writebackArgs);
        expect(content).toContain(
            'Validate that a value-affecting change is correct before calling it safe',
        );
    });

    test('frames the policy beyond consolidation (split / replace / refactor)', () => {
        const content = promptText(writebackArgs);
        // the trigger is any value claim, not just merging duplicates
        expect(content).toContain('splitting');
        expect(content).toContain('refactoring');
    });

    test('spells out both halves of "safe": reference impact AND value correctness', () => {
        const content = promptText(writebackArgs);
        expect(content).toContain('Reference impact');
        expect(content).toContain('Value correctness');
        // both proof methods the policy offers
        expect(content).toContain('By construction');
        expect(content).toContain('By data');
    });

    test('names the real tools the agent uses to prove value correctness', () => {
        const content = promptText(writebackArgs);
        expect(content).toContain('runQuery');
        expect(content).toContain('generateVisualization');
        expect(content).toContain('total grain');
        expect(content).toContain('time dimension');
    });

    test('requires surfacing divergence rather than asserting safety', () => {
        const content = promptText(writebackArgs);
        expect(content).toContain('diverge');
        expect(content).toContain('do **not** call it safe');
    });

    test('omits the change-validation policy when writeback is disabled', () => {
        const content = promptText({
            ...writebackArgs,
            enableAiWriteback: false,
        });
        expect(content).not.toContain(
            'Validate that a value-affecting change is correct before calling it safe',
        );
    });
});

describe('getSystemPromptV2 repo-fs code search caveat', () => {
    const repoFsArgs = {
        availableExplores: [],
        enableRepoDiscovery: true,
        repoFsRoot: '.',
    };

    test('appends the no-search caveat when code search is unsupported (GitLab)', () => {
        const content = promptText({
            ...repoFsArgs,
            repoFsSupportsCodeSearch: false,
        });
        expect(content).toContain(
            "`search` is unavailable for this project's repositories",
        );
    });

    test('omits the caveat when code search is supported (GitHub / default)', () => {
        expect(
            promptText({ ...repoFsArgs, repoFsSupportsCodeSearch: true }),
        ).not.toContain(
            "`search` is unavailable for this project's repositories",
        );
        // Default (arg omitted) is "supported", so no caveat either.
        expect(promptText(repoFsArgs)).not.toContain(
            "`search` is unavailable for this project's repositories",
        );
    });

    test('never adds the caveat when repo discovery is off', () => {
        const content = promptText({
            availableExplores: [],
            enableRepoDiscovery: false,
            repoFsSupportsCodeSearch: false,
        });
        expect(content).not.toContain(
            "`search` is unavailable for this project's repositories",
        );
    });
});
