import { describe, expect, it } from 'vitest';
import { authoringStatusLabel, deriveAuthoringStatus } from './authoringStatus';

const history = (latestReadyVersion: number | null) =>
    ({ latestReadyVersion }) as Parameters<
        typeof deriveAuthoringStatus
    >[0]['history'];

describe('deriveAuthoringStatus', () => {
    it('says nothing while the author is still describing', () => {
        expect(
            deriveAuthoringStatus({
                isBuilding: false,
                elapsed: null,
                previewVersion: null,
                history: history(null),
            }),
        ).toBeNull();
    });

    it('reports a build with its clock', () => {
        const status = deriveAuthoringStatus({
            isBuilding: true,
            elapsed: '0:42',
            previewVersion: 1,
            history: history(1),
        });
        expect(status).toEqual({ kind: 'building', elapsed: '0:42' });
        expect(authoringStatusLabel(status!)).toBe('Building 0:42');
    });

    it('reports the version on screen once it is the current one', () => {
        const status = deriveAuthoringStatus({
            isBuilding: false,
            elapsed: null,
            previewVersion: 2,
            history: history(2),
        });
        expect(status).toEqual({ kind: 'ready', version: 2 });
        expect(authoringStatusLabel(status!)).toBe('v2 ready');
    });

    it('says nothing while an older version is pinned', () => {
        expect(
            deriveAuthoringStatus({
                isBuilding: false,
                elapsed: null,
                previewVersion: 1,
                history: history(2),
            }),
        ).toBeNull();
    });
});
