import { Knex } from 'knex';
import { SessionTableName } from '../database/entities/sessions';

export class SessionModel {
    private database: Knex;

    constructor(database: Knex) {
        this.database = database;
    }

    async deleteAllByUserUuid(userUuid: string): Promise<void> {
        await this.database(SessionTableName)
            .whereRaw(`sess @> ?::jsonb`, [
                JSON.stringify({ passport: { user: userUuid } }),
            ])
            .delete();
    }
}
