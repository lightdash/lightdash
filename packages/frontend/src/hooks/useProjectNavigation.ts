import { type ApiError, type ProjectNavigation } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';

export const PROJECT_NAVIGATION_QUERY_KEY = 'project-navigation';

const getStorageKey = (userUuid: string, projectUuid: string) =>
    `projectNavigation:${userUuid}:${projectUuid}`;

const isProjectNavigation = (value: unknown): value is ProjectNavigation =>
    typeof value === 'object' &&
    value !== null &&
    'metrics' in value &&
    typeof value.metrics === 'boolean' &&
    'askAi' in value &&
    typeof value.askAi === 'boolean' &&
    'autopilot' in value &&
    typeof value.autopilot === 'boolean' &&
    'learn' in value &&
    typeof value.learn === 'boolean';

const readStoredNavigation = (
    userUuid: string,
    projectUuid: string,
): ProjectNavigation | undefined => {
    try {
        const stored = localStorage.getItem(
            getStorageKey(userUuid, projectUuid),
        );
        if (stored === null) return undefined;
        const parsed: unknown = JSON.parse(stored);
        return isProjectNavigation(parsed) ? parsed : undefined;
    } catch {
        return undefined;
    }
};

const storeNavigation = (
    userUuid: string,
    projectUuid: string,
    navigation: ProjectNavigation,
) => {
    try {
        localStorage.setItem(
            getStorageKey(userUuid, projectUuid),
            JSON.stringify(navigation),
        );
    } catch {
        // Storage can be unavailable (private mode, quota); the request still answers.
    }
};

const getProjectNavigation = (projectUuid: string) =>
    lightdashApi<ProjectNavigation>({
        url: `/projects/${projectUuid}/navigation`,
        method: 'GET',
        body: undefined,
    });

// The last answer for this user and project renders immediately; the request confirms it.
export const useProjectNavigation = ({
    projectUuid,
    userUuid,
}: {
    projectUuid: string | undefined;
    userUuid: string | undefined;
}) =>
    useQuery<ProjectNavigation, ApiError>({
        queryKey: [PROJECT_NAVIGATION_QUERY_KEY, projectUuid, userUuid],
        queryFn: async () => {
            const navigation = await getProjectNavigation(projectUuid!);
            storeNavigation(userUuid!, projectUuid!, navigation);
            return navigation;
        },
        placeholderData: () =>
            projectUuid && userUuid
                ? readStoredNavigation(userUuid, projectUuid)
                : undefined,
        enabled: !!projectUuid && !!userUuid,
    });
