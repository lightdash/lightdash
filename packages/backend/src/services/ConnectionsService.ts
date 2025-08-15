import { Knex } from "knex"
import { ConnectionsTableName, DbConnection } from "../database/entities/connections";
import { v4 as uuidv4 } from 'uuid';

type ConnectionServiceArgs = {
    database: Knex;
}

export class ConnectionService {
    private readonly database: Knex;

    constructor({ database }: ConnectionServiceArgs) {
        this.database = database;
    }

    async getConnectionByUuid(connectionUuid: string): Promise<DbConnection | undefined> {
        return this.database<DbConnection>(ConnectionsTableName)
            .where('connection_uuid', connectionUuid)
            .andWhere('is_active', true)
            .first();
    }

    async getConnectionsByUserUuid(userUuid: string): Promise<DbConnection[]> {
        return this.database<DbConnection>(ConnectionsTableName)
            .where('user_uuid', userUuid)
            .andWhere('is_active', true)
            .orderBy('created_at', 'desc');
    }

    async createOrUpdate(data: Partial<DbConnection>): Promise<[DbConnection, boolean]> {
        if (!data.connection_uuid) {
            data.connection_uuid = uuidv4();
        }

        const existingConnection = await this.database<DbConnection>(ConnectionsTableName)
            .where('connection_uuid', data.connection_uuid)
            .first();

        if (existingConnection) {
            const [updatedConnection] = await this.database<DbConnection>(ConnectionsTableName)
                .where('connection_uuid', data.connection_uuid)
                .update({
                    ...data,
                    updated_at: this.database.fn.now(),
                })
                .returning('*');
            return [updatedConnection, false];
        } else {
            const [createdConnection] = await this.database<DbConnection>(ConnectionsTableName)
                .insert({
                    ...data,
                    created_at: this.database.fn.now(),
                    updated_at: this.database.fn.now(),
                })
                .returning('*');
            return [createdConnection, true];
        }
    }
}