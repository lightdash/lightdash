import { Knex } from 'knex';

export type DbSession = {
    sid: string;
    sess: object;
    expired: Date;
};
export type SessionTable = Knex.CompositeTableType<DbSession>;

export const SessionTableName = 'sessions';
