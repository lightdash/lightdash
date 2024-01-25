import {
    NotFoundError,
    UnexpectedServerError,
    UpsertUserWarehouseCredentials,
    UserWarehouseCredentials,
    WarehouseTypes,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbUserWarehouseCredentials,
    UserWarehouseCredentialsTableName,
} from '../../database/entities/userWarehouseCredentials';
import { EncryptionService } from '../../services/EncryptionService/EncryptionService';

type ModelDependencies = {
    database: Knex;
    encryptionService: EncryptionService;
};

export class UserWarehouseCredentialsModel {
    private readonly database: Knex;

    private readonly encryptionService: EncryptionService;

    constructor(deps: ModelDependencies) {
        this.database = deps.database;
        this.encryptionService = deps.encryptionService;
    }

    private convertToUserWarehouseCredentials(
        data: DbUserWarehouseCredentials,
    ): UserWarehouseCredentials {
        let credentials: UserWarehouseCredentials['credentials'];
        try {
            const credentialsWithSecrets = JSON.parse(
                this.encryptionService.decrypt(data.encrypted_credentials),
            ) as UpsertUserWarehouseCredentials['credentials'];

            switch (credentialsWithSecrets.type) {
                case WarehouseTypes.REDSHIFT:
                case WarehouseTypes.POSTGRES:
                case WarehouseTypes.TRINO:
                case WarehouseTypes.SNOWFLAKE:
                    credentials = {
                        type: credentialsWithSecrets.type,
                        user: credentialsWithSecrets.user,
                    };
                    break;
                default:
                    credentials = {
                        type: credentialsWithSecrets.type,
                    };
            }
        } catch (e) {
            throw new UnexpectedServerError(
                'Failed to parse warehouse credentials',
            );
        }
        return {
            uuid: data.user_warehouse_credentials_uuid,
            userUuid: data.user_uuid,
            name: data.name,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
            credentials,
        };
    }

    async getAllByUserUuid(
        userUuid: string,
    ): Promise<UserWarehouseCredentials[]> {
        const rows = await this.database(UserWarehouseCredentialsTableName)
            .select('*')
            .where('user_uuid', userUuid)
            .orderBy('created_at');

        return rows.map((r) => this.convertToUserWarehouseCredentials(r));
    }

    async getByUuid(uuid: string): Promise<UserWarehouseCredentials> {
        const result = await this.database(UserWarehouseCredentialsTableName)
            .select('*')
            .where('user_warehouse_credentials_uuid', uuid)
            .first();
        if (!result) {
            throw new NotFoundError('Warehouse credentials not found');
        }
        return this.convertToUserWarehouseCredentials(result);
    }

    async findForProject(
        userUuid: string,
        warehouseType: WarehouseTypes,
    ): Promise<UpsertUserWarehouseCredentials['credentials'] | undefined> {
        const result = await this.database(UserWarehouseCredentialsTableName)
            .select('encrypted_credentials')
            .where('warehouse_type', warehouseType)
            .andWhere('user_uuid', userUuid)
            .orderBy('created_at')
            .first();

        if (result) {
            try {
                return JSON.parse(
                    this.encryptionService.decrypt(
                        result.encrypted_credentials,
                    ),
                ) as UpsertUserWarehouseCredentials['credentials'];
            } catch (e) {
                throw new UnexpectedServerError(
                    'Failed to parse user warehouse credentials',
                );
            }
        }
        return undefined;
    }

    async create(
        userUuid: string,
        data: UpsertUserWarehouseCredentials,
    ): Promise<string> {
        let encryptedCredentials: Buffer;
        try {
            encryptedCredentials = this.encryptionService.encrypt(
                JSON.stringify(data.credentials),
            );
        } catch (e) {
            throw new UnexpectedServerError('Could not save credentials.');
        }
        const [result] = await this.database(UserWarehouseCredentialsTableName)
            .insert({
                user_uuid: userUuid,
                name: data.name,
                warehouse_type: data.credentials.type,
                encrypted_credentials: encryptedCredentials,
            })
            .returning('*');

        if (!result) {
            throw new UnexpectedServerError('Could not save credentials.');
        }
        return result.user_warehouse_credentials_uuid;
    }

    async update(
        userUuid: string,
        userWarehouseCredentialsUuid: string,
        data: UpsertUserWarehouseCredentials,
    ): Promise<string> {
        let encryptedCredentials: Buffer;
        try {
            encryptedCredentials = this.encryptionService.encrypt(
                JSON.stringify(data.credentials),
            );
        } catch (e) {
            throw new UnexpectedServerError('Could not save credentials.');
        }
        const [result] = await this.database(UserWarehouseCredentialsTableName)
            .update({
                name: data.name,
                warehouse_type: data.credentials.type,
                encrypted_credentials: encryptedCredentials,
                updated_at: new Date(),
            })
            .where(
                'user_warehouse_credentials_uuid',
                userWarehouseCredentialsUuid,
            )
            .andWhere('user_uuid', userUuid)
            .returning('*');

        if (!result) {
            throw new UnexpectedServerError('Could not save credentials.');
        }
        return result.user_warehouse_credentials_uuid;
    }

    async delete(
        userUuid: string,
        userWarehouseCredentialsUuid: string,
    ): Promise<void> {
        await this.database(UserWarehouseCredentialsTableName)
            .delete()
            .where(
                'user_warehouse_credentials_uuid',
                userWarehouseCredentialsUuid,
            )
            .andWhere('user_uuid', userUuid);
    }
}
