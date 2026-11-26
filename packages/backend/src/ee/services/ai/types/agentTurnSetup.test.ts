import {
    DEFAULT_AGENT_TURN_SETUP,
    DEFAULT_AGENT_WRITEBACK_SETUP,
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
});
