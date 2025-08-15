import { AlreadyExistsError } from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbConnection,
    ConnectionsTableName,
} from '../database/entities/connections';

type ConnectionsModelArgs = {
    database: Knex;
};

export class ConnectionsModel {
    private readonly database: Knex;

    constructor({ database }: ConnectionsModelArgs) {
        this.database = database;
    }

    async create(data: any): Promise<DbConnection> {
        // Super simple uniqueness check: name + type + user
        const existing = await this.database<DbConnection>(ConnectionsTableName)
            .where({
                type: data.type,
                user_uuid: data.user_uuid ?? null,
            })
            .first();

        if (existing) {
            throw new AlreadyExistsError(
                `Connection "${data.name}" (${data.type}) already exists for this user`,
            );
        }

        const [created] = await this.database<DbConnection>(ConnectionsTableName)
            .insert({
                ...data,
                updated_at: this.database.fn.now(),
            })
            .returning('*');

        return created;
    }

    async getByUuid(connectionUuid: string): Promise<DbConnection | undefined> {
        return this.database<DbConnection>(ConnectionsTableName)
            .where('connection_uuid', connectionUuid)
            .first();
    }

    async updateByUuid(
        connectionUuid: string,
        updates: Partial<
            Omit<
                DbConnection,
                'connection_id' | 'connection_uuid' | 'created_at'
            >
        >,
    ): Promise<DbConnection> {
        const [updated] = await this.database<DbConnection>(ConnectionsTableName)
            .where('connection_uuid', connectionUuid)
            .update(
                {
                    ...updates,
                    updated_at: this.database.fn.now(),
                },
                '*',
            );

        return updated;
    }
}
