import { type RequestListener } from 'http';
import { Response } from 'node-fetch';
import GlobalState from '../../../globalState';
import { performDatabricksOAuthFlow } from './oauth';

const mocks = vi.hoisted(() => ({
    handler: null as RequestListener | null,
    verifier: '',
}));
vi.mock('http', () => ({
    createServer: (handler: RequestListener) => {
        mocks.handler = handler;
        return {
            on: vi.fn(),
            listen: (_port: number, ready: () => void) => ready(),
            address: () => ({ port: 8020 }),
            close: vi.fn(),
        };
    },
}));
vi.mock('../../../handlers/login/oauth', () => ({
    openBrowser: async (value: string) => {
        const url = new URL(value);
        const callback = new URL(url.searchParams.get('redirect_uri')!);
        callback.searchParams.set('code', 'databricks-authorization-code');
        callback.searchParams.set('state', url.searchParams.get('state')!);
        mocks.handler!.call(
            {} as never,
            { url: callback.href } as never,
            { setHeader: vi.fn(), writeHead: vi.fn(), end: vi.fn() } as never,
        );
        return true;
    },
}));
vi.mock('node-fetch', async (original) => ({
    ...(await original<typeof import('node-fetch')>()),
    default: async (_url: string, init: { body: URLSearchParams }) => {
        mocks.verifier = init.body.get('code_verifier')!;
        return new Response(
            JSON.stringify({
                access_token: 'databricks-access-secret',
                refresh_token: 'databricks-refresh-secret',
                expires_in: 3600,
            }),
        );
    },
}));
it('prints the three fixed OAuth debug labels without token prefixes', async () => {
    const debug = vi.spyOn(GlobalState, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
        await performDatabricksOAuthFlow(
            'example.com',
            'client',
            'databricks-client-secret',
        );
        const output = debug.mock.calls.flat().join('\n');
        for (const label of [
            'Got authorization code',
            'OAuth access token:',
            'OAuth refresh token:',
        ])
            expect(output).toContain(`> ${label} [redacted]`);
        for (const secret of [
            'databricks-access-secret',
            'databricks-refresh-secret',
            'databricks-authorization-code',
            'databricks-client-secret',
            mocks.verifier,
        ]) {
            expect(output).not.toContain(secret.slice(0, 10));
        }
    } finally {
        vi.restoreAllMocks();
    }
});
