import {
    APP_VERSION_CANCELLED_BY_USER,
    type ApiAppVersionSummary,
    type ApiGetAppResponse,
    type ToolGenerateDataAppOutput,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getDataAppBuildCardState } from './dataAppBuildCardState';

type Metadata = ToolGenerateDataAppOutput['metadata'];

const pending: Metadata = { status: 'pending', appUuid: 'app-1', version: 1 };

const version = (
    overrides: Partial<ApiAppVersionSummary>,
): ApiAppVersionSummary => ({
    version: 1,
    prompt: 'Build me a revenue app',
    status: 'generating',
    statusMessage: null,
    statusHistory: [],
    error: null,
    createdAt: new Date('2026-08-28T10:00:00.000Z'),
    statusUpdatedAt: null,
    createdByUser: null,
    resources: null,
    ...overrides,
});

const app = (
    versions: ApiAppVersionSummary[],
    name = 'Revenue app',
): ApiGetAppResponse['results'] => ({
    appUuid: 'app-1',
    name,
    description: '',
    createdByUserUuid: 'user-1',
    spaceUuid: null,
    spaceName: null,
    template: null,
    pinnedListUuid: null,
    pinnedListOrder: null,
    slug: 'revenue-app',
    views: 0,
    versions,
    hasMore: false,
    latestReadyVersion: null,
});

const loaded = (versions: ApiAppVersionSummary[], name?: string) =>
    ({ kind: 'loaded', app: app(versions, name) }) as const;

describe('getDataAppBuildCardState', () => {
    describe('pending tool result', () => {
        it('is queued before the app has loaded', () => {
            expect(
                getDataAppBuildCardState(pending, { kind: 'loading' }),
            ).toEqual({ kind: 'queued' });
        });

        it('is queued while the version is pending', () => {
            expect(
                getDataAppBuildCardState(
                    pending,
                    loaded([version({ status: 'pending' })]),
                ),
            ).toEqual({ kind: 'queued' });
        });

        it('is queued when the version is not in the fetched page', () => {
            expect(getDataAppBuildCardState(pending, loaded([]))).toEqual({
                kind: 'queued',
            });
        });

        it('stays queued on a transient fetch error so polling continues', () => {
            expect(
                getDataAppBuildCardState(pending, { kind: 'error' }),
            ).toEqual({ kind: 'queued' });
        });

        it('is building with the status message and narration mid-build', () => {
            expect(
                getDataAppBuildCardState(
                    pending,
                    loaded([
                        version({
                            status: 'generating',
                            statusMessage: 'Generating your app',
                            statusHistory: [
                                {
                                    kind: 'thinking',
                                    message: 'Weekly totals by region',
                                    timestamp: '2026-08-28T10:00:01.000Z',
                                },
                                {
                                    kind: 'tool',
                                    message: 'Creating App.tsx',
                                    timestamp: '2026-08-28T10:00:02.000Z',
                                },
                            ],
                        }),
                    ]),
                ),
            ).toEqual({
                kind: 'building',
                statusMessage: 'Generating your app',
                narration: {
                    reasoning: ['Weekly totals by region'],
                    activity: ['Creating App.tsx'],
                },
            });
        });

        it('falls back to a generic stage line when the build has no status message', () => {
            expect(
                getDataAppBuildCardState(
                    pending,
                    loaded([version({ status: 'sandbox' })]),
                ),
            ).toMatchObject({
                kind: 'building',
                statusMessage: 'Building your app',
            });
        });

        it('is ready with duration and completion message once the version is ready', () => {
            expect(
                getDataAppBuildCardState(
                    pending,
                    loaded([
                        version({
                            status: 'ready',
                            statusMessage: 'Your revenue app is ready.',
                            statusUpdatedAt: new Date(
                                '2026-08-28T10:06:12.000Z',
                            ),
                        }),
                    ]),
                ),
            ).toEqual({
                kind: 'ready',
                name: 'Revenue app',
                version: 1,
                durationMs: 372_000,
                completionMessage: 'Your revenue app is ready.',
            });
        });

        it('uses a placeholder name for an app that never got titled', () => {
            expect(
                getDataAppBuildCardState(
                    pending,
                    loaded([version({ status: 'ready' })], ''),
                ),
            ).toMatchObject({
                kind: 'ready',
                name: 'Untitled app app-1',
                completionMessage: 'Your app is ready!',
                durationMs: null,
            });
        });

        it("is failed with the builder's failure copy", () => {
            expect(
                getDataAppBuildCardState(
                    pending,
                    loaded([
                        version({
                            status: 'error',
                            statusMessage: 'Failed to deploy your app.',
                            error: 'stderr',
                        }),
                    ]),
                ),
            ).toEqual({
                kind: 'failed',
                message: 'Failed to deploy your app.',
            });
        });

        it('is cancelled when the version carries the cancellation marker', () => {
            expect(
                getDataAppBuildCardState(
                    pending,
                    loaded([
                        version({
                            status: 'error',
                            statusMessage: APP_VERSION_CANCELLED_BY_USER,
                            error: APP_VERSION_CANCELLED_BY_USER,
                        }),
                    ]),
                ),
            ).toEqual({ kind: 'cancelled' });
        });

        it('is unavailable when the app is gone or inaccessible', () => {
            expect(
                getDataAppBuildCardState(pending, { kind: 'unavailable' }),
            ).toEqual({ kind: 'unavailable' });
        });

        it('reads the requested version, not the newest one', () => {
            expect(
                getDataAppBuildCardState(
                    pending,
                    loaded([
                        version({ version: 2, status: 'generating' }),
                        version({ version: 1, status: 'ready' }),
                    ]),
                ),
            ).toMatchObject({ kind: 'ready', version: 1 });
        });
    });

    describe('success tool result', () => {
        const success: Metadata = {
            status: 'success',
            appUuid: 'app-1',
            version: 1,
            name: 'Revenue app',
            href: '/projects/proj-1/apps/app-1',
        };

        it('renders ready from the result before the app loads', () => {
            expect(
                getDataAppBuildCardState(success, { kind: 'loading' }),
            ).toEqual({
                kind: 'ready',
                name: 'Revenue app',
                version: 1,
                durationMs: null,
                completionMessage: 'Your app is ready!',
            });
        });

        it('fills in duration and completion message once the app loads', () => {
            expect(
                getDataAppBuildCardState(
                    success,
                    loaded([
                        version({
                            status: 'ready',
                            statusMessage: 'Done.',
                            statusUpdatedAt: new Date(
                                '2026-08-28T10:00:30.000Z',
                            ),
                        }),
                    ]),
                ),
            ).toEqual({
                kind: 'ready',
                name: 'Revenue app',
                version: 1,
                durationMs: 30_000,
                completionMessage: 'Done.',
            });
        });

        it('is unavailable when the app was deleted since', () => {
            expect(
                getDataAppBuildCardState(success, { kind: 'unavailable' }),
            ).toEqual({ kind: 'unavailable' });
        });
    });

    describe('error tool result', () => {
        it('is failed with the recorded message', () => {
            expect(
                getDataAppBuildCardState(
                    {
                        status: 'error',
                        appUuid: 'app-1',
                        reason: 'failed',
                        message: 'Build timed out.',
                    },
                    { kind: 'loading' },
                ),
            ).toEqual({ kind: 'failed', message: 'Build timed out.' });
        });

        it('is unavailable when the failed app has since been deleted', () => {
            expect(
                getDataAppBuildCardState(
                    {
                        status: 'error',
                        appUuid: 'app-1',
                        reason: 'failed',
                        message: 'Build timed out.',
                    },
                    { kind: 'unavailable' },
                ),
            ).toEqual({ kind: 'unavailable' });
        });

        it('is cancelled for a recorded cancellation', () => {
            expect(
                getDataAppBuildCardState(
                    {
                        status: 'error',
                        appUuid: 'app-1',
                        reason: 'cancelled',
                        message: 'The build was cancelled.',
                    },
                    { kind: 'loading' },
                ),
            ).toEqual({ kind: 'cancelled' });
        });

        it('renders no card when the build never started', () => {
            expect(
                getDataAppBuildCardState(
                    {
                        status: 'error',
                        appUuid: null,
                        reason: 'failed',
                        message: 'Data apps are not enabled',
                    },
                    { kind: 'loading' },
                ),
            ).toBeNull();
        });
    });
});
