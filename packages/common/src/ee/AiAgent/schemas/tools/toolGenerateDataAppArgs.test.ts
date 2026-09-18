import { APP_VERSION_CANCELLED_BY_USER } from '../../../apps/types';
import {
    getExpiredGenerateDataAppBuildOutcome,
    getGenerateDataAppBuildOutcome,
    toolGenerateDataAppOutputSchema,
} from './toolGenerateDataAppArgs';

const base = {
    siteUrl: 'https://ld.example.com',
    projectUuid: 'proj-1',
    appUuid: 'app-1',
    version: 2,
    name: 'Revenue app',
    slug: 'revenue-app',
    error: null,
    statusMessage: null,
};

describe('getGenerateDataAppBuildOutcome', () => {
    it('is null while the build is in progress', () => {
        expect(
            getGenerateDataAppBuildOutcome({ ...base, status: 'generating' }),
        ).toBeNull();
    });

    it('maps ready to success with the builder link and slug', () => {
        expect(
            getGenerateDataAppBuildOutcome({ ...base, status: 'ready' })
                ?.metadata,
        ).toEqual({
            status: 'success',
            appUuid: 'app-1',
            version: 2,
            name: 'Revenue app',
            slug: 'revenue-app',
            href: 'https://ld.example.com/projects/proj-1/apps/app-1',
        });
    });

    it('words a first ready version as the app being ready in the thread', () => {
        expect(
            getGenerateDataAppBuildOutcome({
                ...base,
                version: 1,
                status: 'ready',
            })?.result,
        ).toBe(
            'The data app "Revenue app" is ready. The user can view it from this thread.',
        );
    });

    it('names the version in the ready copy after the first version', () => {
        expect(
            getGenerateDataAppBuildOutcome({ ...base, status: 'ready' })
                ?.result,
        ).toContain('Version 2 of the data app "Revenue app" is ready.');
    });

    it('maps a failure to error with the user-facing message', () => {
        expect(
            getGenerateDataAppBuildOutcome({
                ...base,
                status: 'error',
                error: 'stack trace',
                statusMessage: 'Failed to deploy your app. Please try again.',
            })?.metadata,
        ).toEqual({
            status: 'error',
            appUuid: 'app-1',
            reason: 'failed',
            message: 'Failed to deploy your app. Please try again.',
        });
    });

    it('maps a cancellation to error', () => {
        expect(
            getGenerateDataAppBuildOutcome({
                ...base,
                status: 'error',
                error: APP_VERSION_CANCELLED_BY_USER,
                statusMessage: APP_VERSION_CANCELLED_BY_USER,
            })?.metadata,
        ).toEqual({
            status: 'error',
            appUuid: 'app-1',
            reason: 'cancelled',
            message: 'The build was cancelled.',
        });
    });

    it('mirrors a ready outcome as structured content that parses with the output schema', () => {
        const outcome = getGenerateDataAppBuildOutcome({
            ...base,
            status: 'ready',
        });

        expect(outcome?.structuredContent).toEqual({
            status: 'success',
            appUuid: 'app-1',
            version: 2,
            name: 'Revenue app',
            slug: 'revenue-app',
            href: 'https://ld.example.com/projects/proj-1/apps/app-1',
        });
        expect(toolGenerateDataAppOutputSchema.safeParse(outcome).success).toBe(
            true,
        );
    });

    it('mirrors a failed outcome as { error } matching the result text', () => {
        const outcome = getGenerateDataAppBuildOutcome({
            ...base,
            status: 'error',
            error: 'stack trace',
            statusMessage: 'Failed to deploy your app. Please try again.',
        });

        expect(outcome?.structuredContent).toEqual({ error: outcome?.result });
        expect(toolGenerateDataAppOutputSchema.safeParse(outcome).success).toBe(
            true,
        );
    });
});

describe('getExpiredGenerateDataAppBuildOutcome', () => {
    it('reports the timeout as an error whose structured content mirrors the text', () => {
        const outcome = getExpiredGenerateDataAppBuildOutcome('app-1');

        expect(outcome.metadata).toEqual({
            status: 'error',
            appUuid: 'app-1',
            reason: 'failed',
            message: 'The build did not report an outcome within 30 minutes.',
        });
        expect(outcome.structuredContent).toEqual({ error: outcome.result });
        expect(toolGenerateDataAppOutputSchema.safeParse(outcome).success).toBe(
            true,
        );
    });
});
