import { APP_VERSION_CANCELLED_BY_USER } from '../../../apps/types';
import { getGenerateDataAppBuildOutcome } from './toolGenerateDataAppArgs';

const base = {
    siteUrl: 'https://ld.example.com',
    projectUuid: 'proj-1',
    appUuid: 'app-1',
    version: 2,
    name: 'Revenue app',
    error: null,
    statusMessage: null,
};

describe('getGenerateDataAppBuildOutcome', () => {
    it('is null while the build is in progress', () => {
        expect(
            getGenerateDataAppBuildOutcome({ ...base, status: 'generating' }),
        ).toBeNull();
    });

    it('maps ready to success with the builder link', () => {
        expect(
            getGenerateDataAppBuildOutcome({ ...base, status: 'ready' })
                ?.metadata,
        ).toEqual({
            status: 'success',
            appUuid: 'app-1',
            version: 2,
            name: 'Revenue app',
            href: 'https://ld.example.com/projects/proj-1/apps/app-1',
        });
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
        ).toEqual({ status: 'error', message: 'The build was cancelled.' });
    });
});
