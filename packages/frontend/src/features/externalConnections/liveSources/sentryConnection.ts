import {
    ApiConnectorType,
    getSentryPaths,
    isSentrySlug,
    SENTRY_MAX_PROJECTS,
    SENTRY_ORIGIN,
} from '@lightdash/common';
import { type TokenLiveSourceForm } from './tokenLiveSource';

// organization/project,project: a token reads every project of its
// organization, so the source names the ones it may read
const splitTarget = (target: string) => {
    const [organizationSlug = '', projects = ''] = target.split('/');
    return {
        organizationSlug,
        projectSlugs: projects.split(',').filter(Boolean),
    };
};

export const SENTRY_TOKEN_FORM = {
    origin: SENTRY_ORIGIN,
    account: {
        label: 'Organization and projects',
        description:
            'Write the organization slug, a slash and the project slugs. Put a comma between project slugs.',
        placeholder: 'acme/mobile-ios,mobile-android',
        invalidMessage:
            'Use the form organization/project. A slug has lowercase letters, digits or dashes, and not digits only. Name each project one time.',
        normalize: (value) => value.toLowerCase().replace(/\s+/g, ''),
        isValid: (value) => {
            const { organizationSlug, projectSlugs } = splitTarget(value);
            return (
                value.split('/').length === 2 &&
                isSentrySlug(organizationSlug) &&
                projectSlugs.length > 0 &&
                projectSlugs.length <= SENTRY_MAX_PROJECTS &&
                projectSlugs.every(isSentrySlug) &&
                new Set(projectSlugs).size === projectSlugs.length &&
                projectSlugs.join(',') === value.split('/')[1]
            );
        },
    },
    tokenLabel: 'Auth token',
    tokenHint:
        'Create it in an internal integration that has read access to Organization, Project and Issue & Event.',
    toApiSource: (target) => ({
        connector: ApiConnectorType.SENTRY,
        ...splitTarget(target),
    }),
    getAccountId: ({ apiSource }) =>
        apiSource?.connector === ApiConnectorType.SENTRY
            ? `${apiSource.organizationSlug}/${apiSource.projectSlugs.join(',')}`
            : '',
    getAccess: (target) => ({
        allowedMethods: ['GET'],
        allowedPathPrefixes: Object.values(
            getSentryPaths(splitTarget(target).organizationSlug),
        ),
        allowedContentTypes: ['application/json'],
    }),
    // The server writes the test request itself, for the projects named
    getTestRequest: (target) => ({
        method: 'GET',
        path: getSentryPaths(splitTarget(target).organizationSlug).events,
        query: {},
    }),
} satisfies TokenLiveSourceForm;
