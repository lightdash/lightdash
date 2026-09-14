import { describe, expect, it } from 'vitest';
import {
    buildConnectionTestResults,
    tunnelHopsAllOk,
    tunnelHopsFailedAt,
} from './warehouseConnectionHops';

describe('warehouseConnectionHops', () => {
    it('marks every tunnel hop ok when the tunnel opened', () => {
        expect(tunnelHopsAllOk().map((h) => [h.stage, h.status])).toEqual([
            ['resolve', 'ok'],
            ['tcp', 'ok'],
            ['handshake', 'ok'],
            ['auth', 'ok'],
            ['forward', 'ok'],
        ]);
    });

    it('splits hops around the failing stage', () => {
        const hops = tunnelHopsFailedAt('auth', 'rejected the key');
        expect(hops.map((h) => [h.stage, h.status])).toEqual([
            ['resolve', 'ok'],
            ['tcp', 'ok'],
            ['handshake', 'ok'],
            ['auth', 'failed'],
            ['forward', 'skipped'],
        ]);
        expect(hops[3].message).toBe('rejected the key');
        expect(hops[4].message).toBeNull();
    });

    it('reports ok only when every hop passed', () => {
        expect(buildConnectionTestResults(tunnelHopsAllOk()).ok).toBe(true);
        expect(
            buildConnectionTestResults([
                ...tunnelHopsFailedAt('tcp', 'timed out'),
                { stage: 'database', status: 'skipped', message: null },
            ]).ok,
        ).toBe(false);
    });
});
