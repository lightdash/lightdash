import { WarehouseSignInRejection } from '@lightdash/common';
import fetch from 'node-fetch';
import {
    DatabricksOAuthRefreshError,
    refreshDatabricksOAuthToken,
} from './DatabricksWarehouseClient';

vi.mock('node-fetch', () => ({ default: vi.fn() }));

const refresh = () =>
    refreshDatabricksOAuthToken('workspace_a', 'client_a', 'personal_token_a');
const response = (status: number, text: string) =>
    ({
        ok: false,
        status,
        text: async () => text,
    }) as Awaited<ReturnType<typeof fetch>>;

test.each(Object.values(WarehouseSignInRejection))(
    'classifies a confirmed %s response',
    async (rejection) => {
        vi.mocked(fetch).mockResolvedValueOnce(
            response(400, JSON.stringify({ error: rejection })),
        );
        await expect(refresh()).rejects.toMatchObject({ rejection });
    },
);

test.each([
    [503, JSON.stringify({ error: 'invalid_grant' })],
    [400, 'invalid_grant'],
    [400, JSON.stringify({ error: 'invalid_request' })],
    [400, JSON.stringify({ error_description: 'invalid_grant' })],
])(
    'does not classify an unconfirmed rejection (%s, %s)',
    async (status, text) => {
        vi.mocked(fetch).mockResolvedValueOnce(
            response(status as number, text as string),
        );
        await expect(refresh()).rejects.toMatchObject({ rejection: undefined });
    },
);

test('does not classify a network failure', async () => {
    const error = new Error('network');
    vi.mocked(fetch).mockRejectedValueOnce(error);
    await expect(refresh()).rejects.toBe(error);
});

test('preserves the existing provider error text for shared callers', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(503, 'provider_detail_a'));
    await expect(refresh()).rejects.toThrow(
        new DatabricksOAuthRefreshError(
            'Failed to refresh Databricks OAuth token: 503 provider_detail_a',
        ),
    );
});
