import { describe, expect, it } from 'vitest';
import {
    APP_VERSION_CANCELLED_BY_USER,
    APP_VERSION_STAGE_ORDER,
    type AppVersionStatus,
} from '../../../apps/types';
import { DATA_APP_BUILD_POLL_INTERVAL_MS } from './toolGenerateDataAppArgs';
import { getDataAppBuildStatusResponse } from './toolGetDataAppBuildStatusArgs';

const APP_UUID = '11111111-2222-3333-4444-555555555555';

const buildStatus = (
    version: Pick<
        Parameters<typeof getDataAppBuildStatusResponse>[0],
        'status' | 'error' | 'statusMessage' | 'version' | 'name'
    >,
) =>
    getDataAppBuildStatusResponse({
        siteUrl: 'https://lightdash.example',
        projectUuid: 'project-1',
        appUuid: APP_UUID,
        slug: 'quarterly-review',
        ...version,
    });

describe('getDataAppBuildStatusResponse', () => {
    it.each(APP_VERSION_STAGE_ORDER.filter((stage) => stage !== 'ready'))(
        'reports %s as an in-progress status with no error',
        (stage) => {
            expect(
                buildStatus({
                    status: stage,
                    error: null,
                    statusMessage: null,
                    version: 1,
                    name: 'Quarterly review',
                }),
            ).toEqual({
                status: stage,
                statusMessage: expect.any(String),
                errorMessage: null,
                name: 'Quarterly review',
                slug: 'quarterly-review',
                href: `https://lightdash.example/projects/project-1/apps/quarterly-review`,
                nextPollAfterMs: DATA_APP_BUILD_POLL_INTERVAL_MS,
            });
        },
    );

    it('prefers the row status message over the stage default', () => {
        expect(
            buildStatus({
                status: 'generating',
                error: null,
                statusMessage: 'Adding the revenue chart',
                version: 2,
                name: 'Quarterly review',
            }).statusMessage,
        ).toBe('Adding the revenue chart');
    });

    it('reports ready with the app name', () => {
        expect(
            buildStatus({
                status: 'ready',
                error: null,
                statusMessage: null,
                version: 1,
                name: 'Quarterly review',
            }),
        ).toEqual({
            status: 'ready',
            statusMessage: 'The data app "Quarterly review" is ready.',
            errorMessage: null,
            name: 'Quarterly review',
            slug: 'quarterly-review',
            href: `https://lightdash.example/projects/project-1/apps/quarterly-review`,
            nextPollAfterMs: DATA_APP_BUILD_POLL_INTERVAL_MS,
        });
    });

    it('names the version when a later one is ready', () => {
        expect(
            buildStatus({
                status: 'ready',
                error: null,
                statusMessage: null,
                version: 3,
                name: 'Quarterly review',
            }).statusMessage,
        ).toBe('Version 3 of the data app "Quarterly review" is ready.');
    });

    it('reports error with the failure reason', () => {
        expect(
            buildStatus({
                status: 'error',
                error: 'npm install exited with code 1',
                statusMessage: 'Build failed',
                version: 1,
                name: 'Quarterly review',
            }),
        ).toEqual({
            status: 'error',
            statusMessage: 'Build failed',
            errorMessage: 'npm install exited with code 1',
            name: 'Quarterly review',
            slug: 'quarterly-review',
            href: `https://lightdash.example/projects/project-1/apps/quarterly-review`,
            nextPollAfterMs: DATA_APP_BUILD_POLL_INTERVAL_MS,
        });
    });

    it('falls back to a generic failure when the row carries neither message', () => {
        expect(
            buildStatus({
                status: 'error',
                error: null,
                statusMessage: null,
                version: 1,
                name: 'Quarterly review',
            }),
        ).toMatchObject({
            status: 'error',
            statusMessage: 'The build failed.',
            errorMessage: 'The build failed.',
        });
    });

    it('reports the cancel marker as cancelled rather than an error', () => {
        expect(
            buildStatus({
                status: 'error',
                error: APP_VERSION_CANCELLED_BY_USER,
                statusMessage: 'Build failed',
                version: 1,
                name: 'Quarterly review',
            }),
        ).toEqual({
            status: 'cancelled',
            statusMessage: 'The build was cancelled.',
            errorMessage: null,
            name: 'Quarterly review',
            slug: 'quarterly-review',
            href: `https://lightdash.example/projects/project-1/apps/quarterly-review`,
            nextPollAfterMs: DATA_APP_BUILD_POLL_INTERVAL_MS,
        });
    });

    it('falls back to a placeholder name for an app that never got one', () => {
        expect(
            buildStatus({
                status: 'pending' satisfies AppVersionStatus,
                error: null,
                statusMessage: null,
                version: 1,
                name: '',
            }).name,
        ).toBe('Untitled app 11111111');
    });
});
