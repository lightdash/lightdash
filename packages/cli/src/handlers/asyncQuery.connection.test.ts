import { runWithAgentConnectionSelection } from '../credentials';
import GlobalState from '../globalState';
import { pollForResults, validateConnectionQueryUuid } from './asyncQuery';
import { lightdashApi } from './dbt/apiClient';

vi.mock('./dbt/apiClient', () => ({ lightdashApi: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
it.each(['error', 'unseen server marker!'])(
    'does not log or return server query errors or statuses: %s',
    async (status) => {
        const debug = vi
            .spyOn(GlobalState, 'debug')
            .mockImplementation(() => {});
        vi.mocked(lightdashApi).mockResolvedValue({
            status,
            error: 'unseen server marker!',
        } as never);
        await expect(
            runWithAgentConnectionSelection('default', () =>
                pollForResults('project', 'query'),
            ),
        ).rejects.toThrow(
            status === 'error'
                ? 'Query execution failed.'
                : 'The server returned an invalid query status.',
        );
        expect(JSON.stringify(debug.mock.calls)).not.toContain(
            'unseen server marker!',
        );
    },
);

it('rejects a server query identifier before it can be printed or used in a URL', async () => {
    await expect(
        runWithAgentConnectionSelection('default', async () =>
            validateConnectionQueryUuid('unseen server marker!'),
        ),
    ).rejects.toThrow('The server returned an invalid query identifier.');
});
