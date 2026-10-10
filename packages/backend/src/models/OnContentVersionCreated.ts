import { type Knex } from 'knex';

export type OnContentVersionCreated = (
    trx: Knex.Transaction,
    versionUuid: string | null,
    objectUuid: string,
) => Promise<void>;
