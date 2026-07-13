import {
    getAutopilotInitialPrompt,
    getAutopilotSessionTitle,
    getAutopilotSlackSummaryResult,
    renderManagedAgentConfig,
} from './agent';

describe('Autopilot managed agent configuration', () => {
    it('builds the existing session title and initial prompt', () => {
        const now = new Date('2026-07-13T14:30:00.000Z');

        expect(getAutopilotSessionTitle('project-1', now)).toBe(
            'Health check: project-1 — 2026-07-13T14:30:00.000Z',
        );
        expect(getAutopilotInitialPrompt('project-1', now)).toBe(
            'Today\'s date is 2026-07-13. Analyze project "project-1". Follow your checklist.',
        );
    });

    it('renders project skills and disabled tool settings', () => {
        const rendered = renderManagedAgentConfig({
            lightdashSiteUrl: 'https://lightdash.example.com',
            skillIds: ['skill-1'],
            toolSettings: { createContent: false },
        });
        const customToolNames =
            rendered.tools
                ?.filter((tool) => tool.type === 'custom')
                .map((tool) => tool.name) ?? [];

        expect(rendered.mcp_servers).toEqual([
            {
                name: 'lightdash',
                type: 'url',
                url: 'https://lightdash.example.com/api/v1/mcp',
            },
        ]);
        expect(rendered.skills).toEqual([
            { skill_id: 'skill-1', type: 'custom', version: 'latest' },
        ]);
        expect(customToolNames).not.toContain('create_content_from_code');
        expect(rendered.system).toContain('createContent');
    });

    it('keeps the last valid Slack summary after an invalid call', () => {
        const valid = getAutopilotSlackSummaryResult('', {
            summary: '  Healthy project  ',
        });
        const invalid = getAutopilotSlackSummaryResult(valid.summary, {
            summary: '   ',
        });

        expect(valid).toEqual({
            summary: 'Healthy project',
            summaryLength: 15,
            toolResult: JSON.stringify({ ok: true, summary_length: 15 }),
        });
        expect(invalid).toEqual({
            summary: 'Healthy project',
            summaryLength: 0,
            toolResult: JSON.stringify({ ok: true, summary_length: 0 }),
        });
    });
});
