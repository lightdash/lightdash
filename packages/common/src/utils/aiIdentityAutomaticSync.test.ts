import { describe, expect, it } from 'vitest';
import { AiIdentitySyncStatus } from '../types/aiIdentityAutomaticSync';
import {
    aiIdentityAutomaticSyncGate,
    aiIdentityAutomaticSyncUnsafeReason,
    isAiIdentityAutomaticSyncSafe,
} from './aiIdentityAutomaticSync';

const now = new Date('2026-10-06T10:00:00Z');
const run = {
    status: AiIdentitySyncStatus.OK,
    lastRunAt: new Date('2026-10-06T09:59:00Z'),
    lastOkStartedAt: new Date('2026-10-06T09:58:00Z'),
    schemaWatermark: new Date('2026-10-06T09:57:00Z'),
};

describe('automatic sync gate', () => {
    it('allows an older schema watermark', () => {
        expect(isAiIdentityAutomaticSyncSafe(run, now)).toBe(true);
        expect(aiIdentityAutomaticSyncUnsafeReason(run, now)).toBeNull();
    });
    it('pauses after a newer schema watermark with a typed reason', () => {
        expect(
            aiIdentityAutomaticSyncUnsafeReason(
                { ...run, schemaWatermark: new Date('2026-10-06T09:58:01Z') },
                now,
            ),
        ).toBe('schema_changed');
    });
    it('pauses when there is no OK run', () => {
        expect(
            aiIdentityAutomaticSyncUnsafeReason(
                { ...run, lastOkStartedAt: null },
                now,
            ),
        ).toBe('no_ok_run');
    });
    it('shows first sync in progress while the AI gate stays closed', () => {
        const first = {
            ...run,
            status: AiIdentitySyncStatus.RUNNING,
            lastOkStartedAt: null,
        };
        expect(aiIdentityAutomaticSyncGate(first, now)).toEqual({
            status: 'PROGRESS',
            reason: 'no_ok_run',
        });
        expect(isAiIdentityAutomaticSyncSafe(first, now)).toBe(false);
    });
    it('ends first-sync progress when the run is too old', () => {
        expect(
            aiIdentityAutomaticSyncGate(
                {
                    ...run,
                    status: AiIdentitySyncStatus.RUNNING,
                    lastOkStartedAt: null,
                    lastRunAt: new Date('2026-10-06T08:00:00Z'),
                },
                now,
            ),
        ).toEqual({ status: 'UNSAFE', reason: 'no_ok_run' });
    });
    it('rejects an old OK run', () => {
        expect(
            aiIdentityAutomaticSyncUnsafeReason(
                { ...run, lastRunAt: new Date('2026-10-06T08:00:00Z') },
                now,
            ),
        ).toBe('stale_run');
    });
});
