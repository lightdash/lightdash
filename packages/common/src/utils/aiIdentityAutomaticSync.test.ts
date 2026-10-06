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
    hasOkRun: true,
    exposure: { status: 'OK' as const, exposed: [], error: null },
};

describe('automatic sync gate', () => {
    it('allows safe exposure', () => {
        expect(isAiIdentityAutomaticSyncSafe(run, now)).toBe(true);
        expect(aiIdentityAutomaticSyncUnsafeReason(run, now)).toBeNull();
    });
    it('pauses on exposure with a typed reason', () => {
        expect(
            aiIdentityAutomaticSyncUnsafeReason(
                {
                    ...run,
                    exposure: {
                        status: 'UNSAFE',
                        exposed: ['SCHEMA DATA.SECRET'],
                        error: null,
                    },
                },
                now,
            ),
        ).toBe('exposure');
    });
    it('pauses when there is no OK run', () => {
        expect(
            aiIdentityAutomaticSyncUnsafeReason(
                { ...run, hasOkRun: false },
                now,
            ),
        ).toBe('no_ok_run');
    });
    it('shows first sync in progress while the AI gate stays closed', () => {
        const first = {
            ...run,
            status: AiIdentitySyncStatus.RUNNING,
            hasOkRun: false,
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
                    hasOkRun: false,
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

describe('live exposure results from 2026-10-06', () => {
    it.each([
        ['rename into the pattern', 'SCHEMA DATA.MART_27_CLEAR'],
        ['SWAP WITH', 'SCHEMA DATA.PAYMENTS_CLEAR'],
        ['revoked-grantor rename', 'SCHEMA DATA.MART_26_CLEAR'],
        ['rename out of scope', 'SCHEMA DB2.MART_29_CLEAR'],
    ])('refuses %s despite a fresh successful sync', (_name, exposed) => {
        expect(
            aiIdentityAutomaticSyncGate(
                {
                    ...run,
                    exposure: {
                        status: 'UNSAFE',
                        exposed: [exposed],
                        error: null,
                    },
                },
                now,
            ),
        ).toEqual({ status: 'UNSAFE', reason: 'exposure' });
    });
    it.each(['dbt-like load', 'CREATE SCHEMA'])(
        'allows %s with no exposure',
        () => {
            expect(aiIdentityAutomaticSyncGate(run, now)).toEqual({
                status: 'OK',
                reason: null,
            });
        },
    );
    it('refuses a failed exposure check', () => {
        expect(
            aiIdentityAutomaticSyncGate(
                {
                    ...run,
                    exposure: {
                        status: 'UNSAFE',
                        exposed: [],
                        error: 'Cannot inspect DATA.SECRET',
                    },
                },
                now,
            ),
        ).toEqual({ status: 'UNSAFE', reason: 'exposure_check_failed' });
    });
});
