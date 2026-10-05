import {
    DatabricksTokenError,
    WarehouseSignInRejection,
} from '@lightdash/common';
import fetch from 'node-fetch';
import { refreshDatabricksOAuthToken } from './DatabricksWarehouseClient';

vi.mock('node-fetch', () => ({ default: vi.fn() }));

describe('refreshDatabricksOAuthToken', () => {
    test('classifies a structured invalid_grant response', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
            ok: false,
            status: 400,
            text: async () => JSON.stringify({ error: 'invalid_grant' }),
        } as Awaited<ReturnType<typeof fetch>>);

        await expect(
            refreshDatabricksOAuthToken(
                'example.databricks.com',
                'client-id',
                'refresh-token',
            ),
        ).rejects.toMatchObject({
            name: 'DatabricksTokenError',
            data: { rejection: WarehouseSignInRejection.INVALID_GRANT },
        });
    });

    test('does not classify a server failure as a token rejection', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
            ok: false,
            status: 503,
            text: async () => JSON.stringify({ error: 'invalid_grant' }),
        } as Awaited<ReturnType<typeof fetch>>);

        await expect(
            refreshDatabricksOAuthToken(
                'example.databricks.com',
                'client-id',
                'refresh-token',
            ),
        ).rejects.not.toBeInstanceOf(DatabricksTokenError);
    });
});
