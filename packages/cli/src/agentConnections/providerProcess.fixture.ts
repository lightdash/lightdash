import { AgentTokenProvider } from './agentTokenProvider';
import { slotFixture } from './fixtures';
import { AgentConnectionStore } from './store';

const run = async () => {
    const store = new AgentConnectionStore(process.argv[2]);
    const slot = { ...slotFixture(), instanceUrl: process.argv[3] };
    const result = await new AgentTokenProvider(store).getToken(slot);
    process.stdout.write(
        JSON.stringify({
            generation: result.tokens.generation,
            rotated:
                result.tokens.accessToken === 'new-access' &&
                result.tokens.refreshToken === 'new-refresh',
        }),
    );
};
void run().catch((error: Error) => {
    process.stderr.write(error.message);
    process.exitCode = 1;
});
