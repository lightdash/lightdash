import { useSessionStorage } from 'react-use';

export const getSqlAutoApproveKey = (threadUuid: string) =>
    `sql-auto-approve:${threadUuid}`;

// Read for calls with no approval target; never written.
const NO_THREAD_KEY = 'sql-auto-approve:none';

/** Non-hook read of the same flag, for code outside the thread's components. */
export const isThreadSqlAutoApproved = (threadUuid: string): boolean => {
    try {
        const stored = window.sessionStorage.getItem(
            getSqlAutoApproveKey(threadUuid),
        );
        return stored !== null && JSON.parse(stored) === true;
    } catch {
        return false;
    }
};

/** Whether the user chose to approve every SQL call in this thread; false without a thread. */
export const useSqlAutoApprove = (threadUuid: string | null) => {
    const [autoApprove] = useSessionStorage<boolean>(
        threadUuid === null ? NO_THREAD_KEY : getSqlAutoApproveKey(threadUuid),
        false,
    );
    return threadUuid !== null && autoApprove;
};
