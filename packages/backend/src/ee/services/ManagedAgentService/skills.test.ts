import { BuiltInSkills } from '../ai/skills/builtInSkills';
import {
    AUTOPILOT_CHART_SKILL_NAME,
    AUTOPILOT_SLACK_SKILL_NAME,
} from './config/agent';
import { loadAutopilotSkill } from './skills';

describe('loadAutopilotSkill', () => {
    it('serves the Slack tone skill from the service directory', async () => {
        const loadBuiltInSkill = vi.fn();

        const skill = await loadAutopilotSkill(
            AUTOPILOT_SLACK_SKILL_NAME,
            loadBuiltInSkill,
        );

        expect(loadBuiltInSkill).not.toHaveBeenCalled();
        expect(skill?.name).toBe(AUTOPILOT_SLACK_SKILL_NAME);
        expect(skill?.description).toContain('Slack');
        expect(skill?.body).toContain('Agent Positioning');
    });

    it('adapts chart workflows while reusing chart reference resources', async () => {
        const builtIn = {
            name: AUTOPILOT_CHART_SKILL_NAME,
            description: 'Chart-as-code reference',
            body: 'Use readContent and editContent',
            resources: [
                {
                    name: 'cartesian-chart-reference',
                    description: 'Cartesian',
                    content: 'Chart schema',
                },
                {
                    name: 'dashboard-reference',
                    description: 'Dashboard',
                    content: 'Dashboard edits',
                },
            ],
        };
        const loadBuiltInSkill = vi.fn().mockResolvedValue(builtIn);

        const skill = await loadAutopilotSkill(
            AUTOPILOT_CHART_SKILL_NAME,
            loadBuiltInSkill,
        );

        expect(loadBuiltInSkill).toHaveBeenCalledWith(
            AUTOPILOT_CHART_SKILL_NAME,
        );
        expect(skill?.body).toContain('fix_broken_chart');
        expect(skill?.body).toContain('runMetricQuery');
        expect(skill?.body).not.toMatch(
            /readContent|editContent|createContent|runContentQuery/,
        );
        expect(skill?.resources).toEqual([builtIn.resources[0]]);
    });

    it('does not expose other built-in skills to Autopilot', async () => {
        const loadBuiltInSkill = vi.fn().mockResolvedValue({
            name: 'other',
            description: '',
            body: '',
        });

        const skill = await loadAutopilotSkill('other', loadBuiltInSkill);

        expect(loadBuiltInSkill).not.toHaveBeenCalled();
        expect(skill).toBeUndefined();
    });
    it('serves real chart references without chat-only tool instructions', async () => {
        const skill = await loadAutopilotSkill(
            AUTOPILOT_CHART_SKILL_NAME,
            (name) => BuiltInSkills.getAiAgentSkill(name),
        );
        expect(skill?.resources?.length).toBeGreaterThan(5);
        const text = [
            skill?.body,
            ...(skill?.resources?.map((resource) => resource.content) ?? []),
        ].join('\n');
        expect(text).not.toMatch(
            /\b(readContent|editContent|createContent|runContentQuery|generateHashes|generate_hashes)\b/,
        );
    });
});
