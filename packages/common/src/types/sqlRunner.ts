import { type ResultRow } from './results';

export type SqlRunnerPayload = {
    projectUuid: string;
    sql: string;
    userUuid: string;
    organizationUuid: string | undefined;
};

export type SqlRunnerBody = {
    sql: string;
};

export type SqlRunnerResults = ResultRow[];

export const sqlRunnerJob = 'sqlRunner';
