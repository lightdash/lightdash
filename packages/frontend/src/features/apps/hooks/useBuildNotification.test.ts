import {
    APP_VERSION_CANCELLED_BY_USER,
    type ApiAppVersionSummary,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getBuildNotificationContent } from './useBuildNotification';

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

describe('getBuildNotificationContent', () => {
    it('notifies a ready build', () => {
        expect(
            getBuildNotificationContent('Sales', summary({ status: 'ready' })),
        ).toEqual({
            title: 'Sales - version ready!',
            body: 'Version 3 has finished building.',
        });
    });

    it('notifies a failed build', () => {
        expect(
            getBuildNotificationContent(
                'Sales',
                summary({ status: 'error', error: 'boom' }),
            ),
        ).toEqual({
            title: 'Sales - build failed',
            body: 'Version 3 failed to build.',
        });
    });

    it('skips a user-cancelled build', () => {
        expect(
            getBuildNotificationContent(
                'Sales',
                summary({
                    status: 'error',
                    error: APP_VERSION_CANCELLED_BY_USER,
                }),
            ),
        ).toBeNull();
    });

    it('falls back to a generic app name', () => {
        expect(getBuildNotificationContent('', summary({}))?.title).toBe(
            'App - version ready!',
        );
    });
});
