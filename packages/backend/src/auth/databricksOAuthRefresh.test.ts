import {
    exchangeDatabricksOAuthCredentials,
    refreshDatabricksOAuthToken,
} from '@lightdash/warehouses';
import { FetchError } from 'node-fetch';
import { Agent } from 'node:http';
import { deferred } from '../models/RefreshTokenRotation/fakeKnex.mock';
import {
    exchangeDatabricksOAuthCredentialsWithDeadline,
    refreshDatabricksOAuthTokenWithDeadline,
} from './databricksOAuthRefresh';
import * as deadline from './oauthRequestDeadline';

vi.mock('@lightdash/warehouses', () => ({
    exchangeDatabricksOAuthCredentials: vi.fn(),
    refreshDatabricksOAuthToken: vi.fn(),
}));
afterEach(() => vi.restoreAllMocks());

const modes = ['exchange', 'refresh'] as const;
const setup = (mode: (typeof modes)[number]) => {
    const agent = new Agent();
    const destroy = vi.spyOn(agent, 'destroy');
    const create = vi
        .spyOn(deadline, 'createOAuthDeadlineAgent')
        .mockReturnValue(agent);
    const helper =
        mode === 'exchange'
            ? vi.mocked(exchangeDatabricksOAuthCredentials)
            : vi.mocked(refreshDatabricksOAuthToken);
    const run = () =>
        mode === 'exchange'
            ? exchangeDatabricksOAuthCredentialsWithDeadline(
                  'workspace.test',
                  'client',
                  'secret',
              )
            : refreshDatabricksOAuthTokenWithDeadline(
                  'workspace.test',
                  'client',
                  'refresh',
                  'secret',
              );
    return { agent, destroy, create, helper, run };
};

describe.each(modes)('%s deadline', (mode) => {
    test('forwards credentials and holds the agent until body processing completes', async () => {
        const f = setup(mode);
        const body = deferred<{
            accessToken: string;
            refreshToken: string;
            expiresIn: number;
        }>();
        f.helper.mockReturnValue(body.promise);
        const result = f.run();
        expect(f.create).toHaveBeenCalledExactlyOnceWith(
            'https://workspace.test/oidc/v1/token',
            deadline.OAUTH_REQUEST_TIMEOUT_MS,
        );
        expect(f.helper).toHaveBeenCalledWith(
            ...(mode === 'exchange'
                ? ['workspace.test', 'client', 'secret', { agent: f.agent }]
                : [
                      'workspace.test',
                      'client',
                      'refresh',
                      'secret',
                      { agent: f.agent },
                  ]),
        );
        expect(f.destroy).not.toHaveBeenCalled();
        const token = {
            accessToken: 'access',
            refreshToken: 'rotated',
            expiresIn: 3600,
        };
        body.resolve(token);
        await expect(result).resolves.toBe(token);
        expect(f.destroy).toHaveBeenCalledTimes(1);
    });

    test('normalizes a node-fetch timeout code and destroys the agent', async () => {
        const f = setup(mode);
        f.helper.mockRejectedValue(
            new FetchError(
                'wrapped timeout',
                'system',
                new deadline.OAuthRequestTimeoutError(),
            ),
        );
        await expect(f.run()).rejects.toBeInstanceOf(
            deadline.OAuthRequestTimeoutError,
        );
        expect(f.destroy).toHaveBeenCalledTimes(1);
    });

    test.each([
        new Error('provider failure'),
        new FetchError('connection reset', 'system', {
            code: 'ECONNRESET',
        } as NodeJS.ErrnoException),
        new deadline.OAuthRequestTimeoutError(),
    ])(
        'preserves other error objects and destroys the agent: %s',
        async (error) => {
            const f = setup(mode);
            f.helper.mockRejectedValue(error);
            await expect(f.run()).rejects.toBe(error);
            expect(f.destroy).toHaveBeenCalledTimes(1);
        },
    );
});
