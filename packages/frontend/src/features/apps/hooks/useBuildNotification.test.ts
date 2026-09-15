import {
    APP_VERSION_CANCELLED_BY_USER,
    type ApiAppVersionSummary,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getBuildNotificationContent,
    getBuildOutcome,
} from './useBuildNotification';

const summary = (
    overrides: Partial<ApiAppVersionSummary>,
): ApiAppVersionSummary =>
    ({
        version: 3,
        prompt: 'build it',
        status: 'ready',
        statusMessage: null,
        statusHistory: [],
        error: null,
        createdAt: new Date(),
        ...overrides,
    }) as ApiAppVersionSummary;

describe('getBuildOutcome', () => {
    it('maps a ready version', () => {
        expect(getBuildOutcome(summary({ status: 'ready' }))).toEqual({
            kind: 'ready',
            version: 3,
        });
    });

    it('maps an errored version to failed', () => {
        expect(
            getBuildOutcome(summary({ status: 'error', error: 'boom' })),
        ).toEqual({ kind: 'failed', version: 3 });
    });

    it('maps a user-cancelled version to cancelled', () => {
        expect(
            getBuildOutcome(
                summary({
                    status: 'error',
                    error: APP_VERSION_CANCELLED_BY_USER,
                }),
            ),
        ).toEqual({ kind: 'cancelled', version: 3 });
    });
});

describe('getBuildNotificationContent', () => {
    it('notifies a ready build', () => {
        expect(
            getBuildNotificationContent('Sales', { kind: 'ready', version: 3 }),
        ).toEqual({
            title: 'Sales - version ready!',
            body: 'Version 3 has finished building.',
        });
    });

    it('notifies a failed build', () => {
        expect(
            getBuildNotificationContent('Sales', {
                kind: 'failed',
                version: 3,
            }),
        ).toEqual({
            title: 'Sales - build failed',
            body: 'Version 3 failed to build.',
        });
    });

    it('skips a cancelled build', () => {
        expect(
            getBuildNotificationContent('Sales', {
                kind: 'cancelled',
                version: 3,
            }),
        ).toBeNull();
    });

    it('falls back to a generic app name', () => {
        expect(
            getBuildNotificationContent('', { kind: 'ready', version: 3 })
                ?.title,
        ).toBe('App - version ready!');
    });
});
