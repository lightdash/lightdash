import {
    DEFAULT_AGENT_TURN_SETUP,
    DEFAULT_AGENT_WRITEBACK_SETUP,
    NO_AGENT_EXTRA_TOOLS,
} from './agentTurnSetup';

describe('an ordinary Ask AI thread', () => {
    it('asks before running SQL, uses fast decisions and MCP servers, and has no card', () => {
        expect(DEFAULT_AGENT_TURN_SETUP).toEqual({
            studio: null,
            turnCard: null,
            autoApproveSql: false,
            usesFastDecisions: true,
            waitsOnMcpServers: true,
            asksWithoutFlag: false,
        });
    });

    it('saves each change to its own pull request, with nothing to run after', () => {
        expect(DEFAULT_AGENT_WRITEBACK_SETUP).toEqual({
            continuesThreadPullRequest: false,
            showsPullRequestBeforePreview: false,
            onSaved: null,
        });
    });

    it('has none of the tools a kind of thread brings, and refuses one a loadout offers anyway', async () => {
        expect(Object.keys(NO_AGENT_EXTRA_TOOLS)).toHaveLength(7);
        const refusal = 'This tool is not available in this conversation';
        await expect(NO_AGENT_EXTRA_TOOLS.listChanges()).rejects.toThrow(
            refusal,
        );
        await expect(
            NO_AGENT_EXTRA_TOOLS.readSemanticModel('orders'),
        ).rejects.toThrow(refusal);
        await expect(
            NO_AGENT_EXTRA_TOOLS.verify({ check: 'compile' }),
        ).rejects.toThrow(refusal);
    });
});
