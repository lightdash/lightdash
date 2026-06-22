import { AiPromptContext } from '@lightdash/common';
import { AiAgentService } from './AiAgentService';

jest.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: jest.fn().mockImplementation(() => ({})),
}));

const buildMessage = (context: AiPromptContext): string => {
    const message = AiAgentService.createPinnedContextMessage(context);
    expect(message).not.toBeNull();
    return message!.content as string;
};

describe('AiAgentService.createPinnedContextMessage review pins', () => {
    it('renders a pull_request line with number, status and title', () => {
        const content = buildMessage([
            {
                type: 'pull_request',
                prUrl: 'https://github.com/acme/repo/pull/123',
                prNumber: 123,
                provider: null,
                status: 'open',
                title: 'Add weekly_active_users',
            },
        ]);
        expect(content).toContain(
            '- Pull request #123 (open) "Add weekly_active_users" — the change is applied here',
        );
    });

    it('renders a pull_request line falling back to open when status is null', () => {
        const content = buildMessage([
            {
                type: 'pull_request',
                prUrl: 'https://github.com/acme/repo/pull/9',
                prNumber: null,
                provider: null,
                status: null,
                title: null,
            },
        ]);
        expect(content).toContain('- Pull request (open) —');
    });

    it('renders a project_context proposed_change with triggers', () => {
        const content = buildMessage([
            {
                type: 'proposed_change',
                fingerprint: 'fp-1',
                payload: {
                    changeKind: 'project_context',
                    entry: {
                        op: 'create',
                        id: null,
                        kind: 'definition',
                        content: 'Active user = signed in within 28 days',
                        terms: ['active user', 'WAU'],
                        objects: [],
                    },
                },
            },
        ]);
        expect(content).toContain(
            '- Proposed project-context entry: "Active user = signed in within 28 days" (triggers: active user, WAU).',
        );
    });

    it('renders a semantic_layer proposed_change with the recommendation title', () => {
        const content = buildMessage([
            {
                type: 'proposed_change',
                fingerprint: 'fp-2',
                payload: {
                    changeKind: 'semantic_layer',
                    recommendation: {
                        actionType: 'update_semantic_yaml',
                        title: 'Add weekly_active_users metric',
                        rationale: 'No metric exists',
                        targetRefs: [],
                    },
                },
            },
        ]);
        expect(content).toContain(
            '- Proposed semantic-layer change: "Add weekly_active_users metric".',
        );
    });

    it('renders a review_finding honoring the redacted flag', () => {
        const content = buildMessage([
            {
                type: 'review_finding',
                fingerprint: 'fp-3',
                title: 'No metric for weekly active users',
                rootCause: 'semantic_layer',
                findingCount: 8,
                evidenceExcerpts: [
                    {
                        source: 'user_prompt',
                        text: 'secret value',
                        redacted: true,
                    },
                    {
                        source: 'assistant_answer',
                        text: 'visible quote',
                        redacted: false,
                    },
                ],
            },
        ]);
        expect(content).toContain(
            '- Review finding: "No metric for weekly active users" (semantic_layer, seen 8×).',
        );
        // Redacted excerpt is masked, non-redacted excerpt shows its text.
        expect(content).toContain('Evidence: [redacted], "visible quote"');
        expect(content).not.toContain('secret value');
    });

    it('omits the Evidence segment when a review_finding has no excerpts', () => {
        const content = buildMessage([
            {
                type: 'review_finding',
                fingerprint: 'fp-4',
                title: 'Something',
                rootCause: 'ambiguous',
                findingCount: 1,
                evidenceExcerpts: [],
            },
        ]);
        expect(content).toContain('- Review finding: "Something"');
        expect(content).not.toContain('Evidence:');
    });

    it('renders a preview_environment line with project name and status', () => {
        const content = buildMessage([
            {
                type: 'preview_environment',
                previewProjectUuid: 'proj-uuid',
                previewThreadUuid: null,
                status: 'preview_ready',
                projectName: 'Preview: fix WAU',
            },
        ]);
        expect(content).toContain(
            '- Preview environment (Preview: fix WAU) — preview_ready — test the fix in this preview project.',
        );
    });
});
