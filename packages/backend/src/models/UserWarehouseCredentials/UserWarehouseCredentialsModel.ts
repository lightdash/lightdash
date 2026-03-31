import {
    assertUnreachable,
    DatabricksAuthenticationType,
    databricksOauthU2mUserCredentialsSchema,
    DatabricksTokenError,
    NotFoundError,
    ProjectType,
    SnowflakeAuthenticationType,
    snowflakeSsoUserCredentialsSchema,
    SnowflakeTokenError,
    UnexpectedServerError,
    UpsertUserWarehouseCredentials,
    UserWarehouseCredentials,
    UserWarehouseCredentialsWithSecrets,
    WarehouseTypes,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    normalizeDatabricksHost,
    normalizeDatabricksHostLenient,
} from '../../controllers/authentication/strategies/databricksStrategy';
import { ProjectTableName } from '../../database/entities/projects';
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

type DbUserWarehouseCredentialsWithProject = DbUserWarehouseCredentials & {
    project_name: string | null;
    project_type: ProjectType | null;
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
        data: DbUserWarehouseCredentialsWithProject,
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
                case WarehouseTypes.CLICKHOUSE:
                    credentials = {
                        type: credentialsWithSecrets.type,
                        user: credentialsWithSecrets.user,
                    };
                    break;
                case WarehouseTypes.BIGQUERY:
                case WarehouseTypes.DATABRICKS:
                case WarehouseTypes.ATHENA:
                case WarehouseTypes.DUCKDB:
                    credentials = {
                        type: credentialsWithSecrets.type,
                    };
                    break;
                default:
                    return assertUnreachable(
                        credentialsWithSecrets,
                        'Unknown warehouse type',
                    );
            }
        } catch (e) {
            throw new UnexpectedServerError(
                'Failed to parse warehouse credentials',
            );
        }

        const project =
            data.project_uuid && data.project_name && data.project_type
                ? {
                      projectUuid: data.project_uuid,
                      name: data.project_name,
                      type: data.project_type,
                  }
                : null;

        return {
            uuid: data.user_warehouse_credentials_uuid,
            userUuid: data.user_uuid,
            name: data.name,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
            credentials,
            project,
        };
    }

    private baseSelectWithProject() {
        return this.database(UserWarehouseCredentialsTableName)
            .leftJoin(
                ProjectTableName,
                `${ProjectTableName}.project_uuid`,
                `${UserWarehouseCredentialsTableName}.project_uuid`,
            )
            .select(
                `${UserWarehouseCredentialsTableName}.*`,
                `${ProjectTableName}.name as project_name`,
                `${ProjectTableName}.project_type as project_type`,
            );
    }

    async getAllByUserUuid(
        userUuid: string,
    ): Promise<UserWarehouseCredentials[]> {
        const rows = await this.baseSelectWithProject()
            .where(`${UserWarehouseCredentialsTableName}.user_uuid`, userUuid)
            .orderBy(`${UserWarehouseCredentialsTableName}.created_at`);

        return rows.map((r) => this.convertToUserWarehouseCredentials(r));
    }

    /**
     * Get credentials for a user scoped to a project.
     * Returns credentials assigned to this project + unassigned credentials.
     */
    async getAllByUserUuidForProject(
        userUuid: string,
        projectUuid: string,
    ): Promise<UserWarehouseCredentials[]> {
        const rows = await this.baseSelectWithProject()
            .where(`${UserWarehouseCredentialsTableName}.user_uuid`, userUuid)
            .andWhere(function assignedOrUnassigned(this) {
                void this.where(
                    `${UserWarehouseCredentialsTableName}.project_uuid`,
                    projectUuid,
                ).orWhereNull(
                    `${UserWarehouseCredentialsTableName}.project_uuid`,
                );
            })
            .orderBy(`${UserWarehouseCredentialsTableName}.created_at`);

        return rows.map((r) => this.convertToUserWarehouseCredentials(r));
    }

    async getByUuid(uuid: string): Promise<UserWarehouseCredentials> {
        const result = await this.baseSelectWithProject()
            .where(
                `${UserWarehouseCredentialsTableName}.user_warehouse_credentials_uuid`,
                uuid,
            )
            .first();

        if (!result) {
            throw new NotFoundError('Warehouse credentials not found');
        }
        return this.convertToUserWarehouseCredentials(result);
    }

    async findDatabricksOauthU2mForHostWithSecrets(
        userUuid: string,
        serverHostName: string,
        options?: {
            projectUuid?: string;
            includeProjectScoped?: boolean;
        },
    ): Promise<UserWarehouseCredentialsWithSecrets | undefined> {
        const targetHost = normalizeDatabricksHostLenient(serverHostName);
        if (!targetHost) {
            return undefined;
        }

        const query = this.baseSelectWithProject()
            .where(`${UserWarehouseCredentialsTableName}.user_uuid`, userUuid)
            .andWhere(
                `${UserWarehouseCredentialsTableName}.warehouse_type`,
                WarehouseTypes.DATABRICKS,
            );

        if (options?.projectUuid) {
            void query.andWhere(function assignedOrUnassigned(this) {
                void this.where(
                    `${UserWarehouseCredentialsTableName}.project_uuid`,
                    options.projectUuid,
                ).orWhereNull(
                    `${UserWarehouseCredentialsTableName}.project_uuid`,
                );
            });
            void query.orderByRaw(
                `CASE WHEN ${UserWarehouseCredentialsTableName}.project_uuid = ? THEN 0 ELSE 1 END ASC`,
                [options.projectUuid],
            );
        } else if (options?.includeProjectScoped === false) {
            void query.whereNull(
                `${UserWarehouseCredentialsTableName}.project_uuid`,
            );
        }

        const rows = await query.orderBy(
            `${UserWarehouseCredentialsTableName}.created_at`,
            'desc',
        );

        for (const row of rows) {
            const credentials =
                this.convertToUserWarehouseCredentialsWithSecrets(row);
            if (
                credentials.credentials.type !== WarehouseTypes.DATABRICKS ||
                credentials.credentials.authenticationType !==
                    DatabricksAuthenticationType.OAUTH_U2M ||
                !credentials.credentials.refreshToken
            ) {
                // eslint-disable-next-line no-continue
                continue;
            }

            const credentialHost = normalizeDatabricksHostLenient(
                credentials.credentials.serverHostName,
            );
            if (credentialHost === targetHost) {
                return credentials;
            }
        }

        return undefined;
    }

    private async _findProjectCredentials(
        projectUuid: string,
        userUuid: string,
        warehouseType: WarehouseTypes,
    ) {
        const projectPreferredCredentials = await this.baseSelectWithProject()
            .leftJoin(
                ProjectUserWarehouseCredentialPreferenceTableName,
                `${ProjectUserWarehouseCredentialPreferenceTableName}.user_warehouse_credentials_uuid`,
                `${UserWarehouseCredentialsTableName}.user_warehouse_credentials_uuid`,
            )
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

        // Fallback: prefer credential assigned to this project, else unassigned
        return this.baseSelectWithProject()
            .where(
                `${UserWarehouseCredentialsTableName}.warehouse_type`,
                warehouseType,
            )
            .andWhere(
                `${UserWarehouseCredentialsTableName}.user_uuid`,
                userUuid,
            )
            .andWhere(function assignedOrUnassigned(this) {
                void this.where(
                    `${UserWarehouseCredentialsTableName}.project_uuid`,
                    projectUuid,
                ).orWhereNull(
                    `${UserWarehouseCredentialsTableName}.project_uuid`,
                );
            })
            .orderByRaw(
                `CASE WHEN ${UserWarehouseCredentialsTableName}.project_uuid = ? THEN 0 ELSE 1 END ASC`,
                [projectUuid],
            )
            .orderBy(`${UserWarehouseCredentialsTableName}.created_at`, 'desc')
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
            const credentialsWithSecrets =
                this.convertToUserWarehouseCredentialsWithSecrets(credentials);

            // Validate Snowflake SSO credentials with Zod schema
            // This ensures refreshToken is present and token field is not allowed
            if (
                credentialsWithSecrets.credentials.type ===
                    WarehouseTypes.SNOWFLAKE &&
                credentialsWithSecrets.credentials.authenticationType ===
                    SnowflakeAuthenticationType.SSO
            ) {
                const result = snowflakeSsoUserCredentialsSchema.safeParse(
                    credentialsWithSecrets.credentials,
                );
                if (!result.success) {
                    throw new SnowflakeTokenError(
                        `Please reauthenticate to access snowflake`,
                    );
                }
            }

            if (
                credentialsWithSecrets.credentials.type ===
                    WarehouseTypes.DATABRICKS &&
                credentialsWithSecrets.credentials.authenticationType ===
                    DatabricksAuthenticationType.OAUTH_U2M
            ) {
                const result =
                    databricksOauthU2mUserCredentialsSchema.safeParse(
                        credentialsWithSecrets.credentials,
                    );
                if (!result.success) {
                    throw new DatabricksTokenError(
                        `Please reauthenticate to access databricks`,
                    );
                }
            }

            return credentialsWithSecrets;
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
        projectUuid?: string,
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
                project_uuid: projectUuid ?? null,
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

    async deleteAllByUserAndWarehouseType(
        userUuid: string,
        warehouseType: WarehouseTypes,
    ): Promise<void> {
        await this.database(UserWarehouseCredentialsTableName)
            .delete()
            .where('user_uuid', userUuid)
            .andWhere('warehouse_type', warehouseType);
    }
}
