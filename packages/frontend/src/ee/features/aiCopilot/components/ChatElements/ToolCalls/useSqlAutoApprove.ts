import { useSessionStorage } from 'react-use';

export const getSqlAutoApproveKey = (threadUuid: string) =>
    `sql-auto-approve:${threadUuid}`;

/** Whether the user chose to approve every SQL call in this thread. */
export const useSqlAutoApprove = (threadUuid: string) =>
    useSessionStorage<boolean>(getSqlAutoApproveKey(threadUuid), false)[0];
