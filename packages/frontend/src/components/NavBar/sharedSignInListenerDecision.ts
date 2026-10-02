export const queryBelongsToProject = (
    key: readonly unknown[] | undefined,
    projectUuid: string,
): boolean => key?.includes(projectUuid) ?? false;

export const scheduleSharedSignInCooldownCheck = (
    lastCheck: number,
    check: () => void,
): ReturnType<typeof setTimeout> =>
    setTimeout(check, Math.max(0, lastCheck + 60_000 - Date.now()));

export const shouldCheckSharedSignInStatus = ({
    projectUuid,
    pendingProjects,
    openProjects,
    dismissedProjects,
    lastChecks,
    now,
}: {
    projectUuid: string;
    pendingProjects: ReadonlySet<string>;
    openProjects: ReadonlySet<string>;
    dismissedProjects: ReadonlySet<string>;
    lastChecks: ReadonlyMap<string, number>;
    now: number;
}): boolean =>
    !pendingProjects.has(projectUuid) &&
    !openProjects.has(projectUuid) &&
    !dismissedProjects.has(projectUuid) &&
    now - (lastChecks.get(projectUuid) ?? -Infinity) >= 60_000;

export const shouldUseSharedSignInStatus = (
    requestedProjectUuid: string,
    activeProjectUuid: string | undefined,
    dismissedProjects: ReadonlySet<string>,
): boolean =>
    requestedProjectUuid === activeProjectUuid &&
    !dismissedProjects.has(requestedProjectUuid);
