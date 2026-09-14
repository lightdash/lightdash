import { APP_VERSION_CANCELLED_BY_USER } from '../../../apps/types';
import { getGenerateDataAppBuildOutcome } from './toolGenerateDataAppArgs';

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

    it('words a first ready version as the app being ready', () => {
        expect(
            getGenerateDataAppBuildOutcome({
                ...base,
                version: 1,
                status: 'ready',
            })?.result,
        ).toContain('The data app "Revenue app" is ready.');
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
});
