type ThreadOwnership = {
    createdFrom: string;
    user: { uuid: string };
};

/**
 * Slack threads and other people's threads can't be replied to here. A thread
 * that hasn't loaded yet is not read-only: it is just loading.
 */
export const isThreadReadOnly = (
    thread: ThreadOwnership | undefined,
    currentUserUuid: string | undefined,
): boolean => {
    if (!thread || !currentUserUuid) return false;
    return (
        thread.createdFrom === 'slack' || thread.user.uuid !== currentUserUuid
    );
};
