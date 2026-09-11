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

    it('delegates the chart skill to the built-in skills', async () => {
        const builtIn = {
            name: AUTOPILOT_CHART_SKILL_NAME,
            description: 'Chart-as-code reference',
            body: '# Developing in Lightdash',
        };
        const loadBuiltInSkill = vi.fn().mockResolvedValue(builtIn);

        const skill = await loadAutopilotSkill(
            AUTOPILOT_CHART_SKILL_NAME,
            loadBuiltInSkill,
        );

        expect(loadBuiltInSkill).toHaveBeenCalledWith(
            AUTOPILOT_CHART_SKILL_NAME,
        );
        expect(skill).toBe(builtIn);
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
});
