import {
    NotFoundError,
    UnexpectedServerError,
    UpsertUserWarehouseCredentials,
    UserWarehouseCredentials,
    UserWarehouseCredentialsWithSecrets,
    WarehouseTypes,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbUserWarehouseCredentials,
    ProjectUserWarehouseCredentialPreferenceTableName,
    UserWarehouseCredentialsTableName,
} from '../../database/entities/userWarehouseCredentials';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';

type UserWarehouseCredentialsModelArguments = {
    database: Knex;
    encryptionUtil: EncryptionUtil;
};

export class UserWarehouseCredentialsModel {
    private readonly database: Knex;

    private readonly encryptionUtil: EncryptionUtil;

    constructor(args: UserWarehouseCredentialsModelArguments) {
        this.database = args.database;
        this.encryptionUtil = args.encryptionUtil;
    }

    private convertToUserWarehouseCredentialsWithSecrets(
        data: DbUserWarehouseCredentials,
    ): UserWarehouseCredentialsWithSecrets {
        let credentials: UserWarehouseCredentialsWithSecrets['credentials'];
        try {
            credentials = JSON.parse(
                this.encryptionUtil.decrypt(data.encrypted_credentials),
            ) as UpsertUserWarehouseCredentials['credentials'];
        } catch (e) {
            throw new UnexpectedServerError(
                'Failed to parse warehouse credentials',
            );
        }
        return {
            uuid: data.user_warehouse_credentials_uuid,
            credentials,
        };
    }

    private convertToUserWarehouseCredentials(
        data: DbUserWarehouseCredentials,
    ): UserWarehouseCredentials {
        let credentials: UserWarehouseCredentials['credentials'];
        try {
            const credentialsWithSecrets = JSON.parse(
                this.encryptionUtil.decrypt(data.encrypted_credentials),
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

    private async _findProjectCredentials(
        projectUuid: string,
        userUuid: string,
        warehouseType: WarehouseTypes,
    ) {
        const projectPreferredCredentials = await this.database(
            UserWarehouseCredentialsTableName,
        )
            .leftJoin(
                ProjectUserWarehouseCredentialPreferenceTableName,
                `${ProjectUserWarehouseCredentialPreferenceTableName}.user_warehouse_credentials_uuid`,
                `${UserWarehouseCredentialsTableName}.user_warehouse_credentials_uuid`,
            )
            .select(`*`)
            .where(
                `${UserWarehouseCredentialsTableName}.warehouse_type`,
                warehouseType,
            )
            .andWhere(
                `${ProjectUserWarehouseCredentialPreferenceTableName}.project_uuid`,
                projectUuid,
            )
            .andWhere(
                `${ProjectUserWarehouseCredentialPreferenceTableName}.user_uuid`,
                userUuid,
            )
            .first();

        if (projectPreferredCredentials) {
            return projectPreferredCredentials;
        }
        // fallback to compatible credentials
        return this.database(UserWarehouseCredentialsTableName)
            .select('*')
            .where('warehouse_type', warehouseType)
            .andWhere('user_uuid', userUuid)
            .orderBy('created_at')
            .first();
    }

    async findForProject(
        projectUuid: string,
        userUuid: string,
        warehouseType: WarehouseTypes,
    ): Promise<UserWarehouseCredentials | undefined> {
        const credentials = await this._findProjectCredentials(
            projectUuid,
            userUuid,
            warehouseType,
        );
        if (credentials) {
            return this.convertToUserWarehouseCredentials(credentials);
        }
        return undefined;
    }

    async findForProjectWithSecrets(
        projectUuid: string,
        userUuid: string,
        warehouseType: WarehouseTypes,
    ): Promise<UserWarehouseCredentialsWithSecrets | undefined> {
        const credentials = await this._findProjectCredentials(
            projectUuid,
            userUuid,
            warehouseType,
        );
        if (credentials) {
            return this.convertToUserWarehouseCredentialsWithSecrets(
                credentials,
            );
        }
        return undefined;
    }

    async upsertUserCredentialsPreference(
        userUuid: string,
        projectUuid: string,
        userWarehouseCredentialsUuid: string,
    ) {
        const [result] = await this.database(
            ProjectUserWarehouseCredentialPreferenceTableName,
        )
            .insert({
                user_uuid: userUuid,
                user_warehouse_credentials_uuid: userWarehouseCredentialsUuid,
                project_uuid: projectUuid,
            })
            .onConflict(['user_uuid', 'project_uuid'])
            .merge()
            .returning('*');

        if (!result) {
            throw new UnexpectedServerError('Could not save preference.');
        }
    }

    async create(
        userUuid: string,
        data: UpsertUserWarehouseCredentials,
    ): Promise<string> {
        let encryptedCredentials: Buffer;
        try {
            encryptedCredentials = this.encryptionUtil.encrypt(
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
            encryptedCredentials = this.encryptionUtil.encrypt(
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
