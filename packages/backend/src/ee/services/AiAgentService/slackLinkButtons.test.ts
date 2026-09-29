import type { App } from '@slack/bolt';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi.fn(),
}));

describe('Slack link buttons', () => {
    it.each([
        'actions.explore_card_button_click.ai_agent_table_1',
        'actions.download_csv_button_click.ai_agent_table_1',
    ])('acknowledges %s', async (actionId) => {
        const app = { action: vi.fn() };
        AiAgentService.prototype.handleClickExploreButton(
            app as unknown as App,
        );
        const registration = app.action.mock.calls.find(
            ([pattern]) => pattern instanceof RegExp && pattern.test(actionId),
        );
        expect(registration).toBeDefined();

        const ack = vi.fn().mockResolvedValue(undefined);
        await registration?.[1]({ ack });
        expect(ack).toHaveBeenCalledTimes(1);
    });
});
