import {
    assertUnreachable,
    bigquerySsoUserCredentialsSchema,
    BigqueryTokenError,
    CreateWarehouseCredentials,
    DatabricksAuthenticationType,
    databricksOauthU2mUserCredentialsSchema,
    DatabricksTokenError,
    LightdashError,
    NotFoundError,
    ParameterError,
    ProjectType,
    RedshiftAuthenticationType,
    redshiftIamUserCredentialsSchema,
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
import Logger from '../../logging/logger';
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
                    credentials = {
                        type: credentialsWithSecrets.type,
                        user: credentialsWithSecrets.user,
                        ...('authenticationType' in credentialsWithSecrets
                            ? {
                                  authenticationType:
                                      credentialsWithSecrets.authenticationType,
                                  assumeRoleArn:
                                      credentialsWithSecrets.assumeRoleArn,
                              }
                            : {}),
                    };
                    break;
                case WarehouseTypes.POSTGRES:
                case WarehouseTypes.TRINO:
                case WarehouseTypes.SNOWFLAKE:
                case WarehouseTypes.CLICKHOUSE:
                case WarehouseTypes.DORIS:
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

    // Candidates ordered by selection priority: the per-project preference
    // first, then project-assigned credentials, then unassigned ones (newest
    // first within each group).
    private async _findProjectCredentialCandidates(
        projectUuid: string,
        userUuid: string,
        warehouseType: WarehouseTypes,
    ): Promise<
        Array<{
            row: DbUserWarehouseCredentialsWithProject;
            isPreferred: boolean;
        }>
    > {
        const projectPreferredCredentials: DbUserWarehouseCredentialsWithProject =
            await this.baseSelectWithProject()
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

        // Fallback: prefer credential assigned to this project, else unassigned
        const fallbackRows: DbUserWarehouseCredentialsWithProject[] =
            await this.baseSelectWithProject()
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
                .orderBy(
                    `${UserWarehouseCredentialsTableName}.created_at`,
                    'desc',
                );

        const candidates = projectPreferredCredentials
            ? [{ row: projectPreferredCredentials, isPreferred: true }]
            : [];
        fallbackRows.forEach((row) => {
            if (
                row.user_warehouse_credentials_uuid !==
                projectPreferredCredentials?.user_warehouse_credentials_uuid
            ) {
                candidates.push({ row, isPreferred: false });
            }
        });
        return candidates;
    }

    private async _findProjectCredentials(
        projectUuid: string,
        userUuid: string,
        warehouseType: WarehouseTypes,
    ): Promise<DbUserWarehouseCredentialsWithProject | undefined> {
        const candidates = await this._findProjectCredentialCandidates(
            projectUuid,
            userUuid,
            warehouseType,
        );
        return candidates[0]?.row;
    }

    // Returns the error this credential would produce at query time, or
    // undefined if it's usable. SSO-style credentials store refresh tokens
    // that can be missing/empty (e.g. keyfiles persisted before validation
    // existed); anything else is assumed usable.
    static getQueryTimeValidationError(
        credentials: UserWarehouseCredentialsWithSecrets['credentials'],
    ): LightdashError | undefined {
        if (
            credentials.type === WarehouseTypes.SNOWFLAKE &&
            credentials.authenticationType === SnowflakeAuthenticationType.SSO
        ) {
            const result =
                snowflakeSsoUserCredentialsSchema.safeParse(credentials);
            if (!result.success) {
                return new SnowflakeTokenError(
                    `Please reauthenticate to access snowflake`,
                );
            }
        }

        if (
            credentials.type === WarehouseTypes.DATABRICKS &&
            credentials.authenticationType ===
                DatabricksAuthenticationType.OAUTH_U2M
        ) {
            const result =
                databricksOauthU2mUserCredentialsSchema.safeParse(credentials);
            if (!result.success) {
                return new DatabricksTokenError(
                    `Please reauthenticate to access databricks`,
                );
            }
        }

        // Per-user BigQuery credentials are always SSO, so the refresh_token
        // requirement applies to every BigQuery user credential.
        if (credentials.type === WarehouseTypes.BIGQUERY) {
            const result =
                bigquerySsoUserCredentialsSchema.safeParse(credentials);
            if (!result.success) {
                return new BigqueryTokenError(
                    `Please reauthenticate to access BigQuery`,
                );
            }
        }

        return undefined;
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

    // Returns the highest-priority credential that passes query-time
    // validation (e.g. a non-empty BigQuery keyfile), so a single broken
    // credential — even a preferred one — can't lock the user into a
    // reauthentication loop while a valid credential exists. Throws the
    // broken credential's error only when no candidate is usable.
    async findForProjectWithSecrets(
        projectUuid: string,
        userUuid: string,
        warehouseType: WarehouseTypes,
    ): Promise<UserWarehouseCredentialsWithSecrets | undefined> {
        const candidates = await this._findProjectCredentialCandidates(
            projectUuid,
            userUuid,
            warehouseType,
        );

        let firstError: LightdashError | undefined;
        for (const { row, isPreferred } of candidates) {
            let credentialsWithSecrets: UserWarehouseCredentialsWithSecrets;
            try {
                credentialsWithSecrets =
                    this.convertToUserWarehouseCredentialsWithSecrets(row);
            } catch (e) {
                // Undecryptable rows (e.g. encrypted under a rotated secret)
                // are permanently unusable — skip them so they can't block a
                // valid credential, and let the user reauthenticate if none is
                // left rather than surfacing a server error.
                Logger.warn(
                    `Skipping undecryptable user warehouse credential ${row.user_warehouse_credentials_uuid} (type: ${warehouseType}, preferred: ${isPreferred}) for user ${userUuid} on project ${projectUuid}`,
                );
                // eslint-disable-next-line no-continue
                continue;
            }
            const validationError =
                UserWarehouseCredentialsModel.getQueryTimeValidationError(
                    credentialsWithSecrets.credentials,
                );
            if (!validationError) {
                if (firstError) {
                    Logger.warn(
                        `Using fallback user warehouse credential ${credentialsWithSecrets.uuid} for user ${userUuid} on project ${projectUuid}: a higher-priority ${warehouseType} credential failed validation`,
                    );
                }
                return credentialsWithSecrets;
            }
            Logger.warn(
                `Skipping invalid user warehouse credential ${
                    credentialsWithSecrets.uuid
                } (type: ${warehouseType}, preferred: ${isPreferred}) for user ${userUuid} on project ${projectUuid}: ${
                    validationError.message
                }`,
            );
            firstError = firstError ?? validationError;
        }

        if (firstError) {
            throw firstError;
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

    // Reject credentials that would be unusable at query time, so we never
    // persist an empty shell (e.g. a masked BigQuery placeholder keyfile that
    // overwrites a working credential). Per-user BigQuery credentials are
    // always SSO, so the refresh_token requirement applies to all of them.
    private static validateCredentialsForPersistence(
        data: UpsertUserWarehouseCredentials,
    ): void {
        if (data.credentials.type === WarehouseTypes.BIGQUERY) {
            const result = bigquerySsoUserCredentialsSchema.safeParse(
                data.credentials,
            );
            if (!result.success) {
                throw new ParameterError(
                    'BigQuery credentials require a valid keyfile. Please reauthenticate with Google.',
                );
            }
        }

        if (
            data.credentials.type === WarehouseTypes.REDSHIFT &&
            'authenticationType' in data.credentials &&
            (data.credentials.authenticationType ===
                RedshiftAuthenticationType.IAM ||
                data.credentials.authenticationType ===
                    RedshiftAuthenticationType.IAM_BROWSER)
        ) {
            const result = redshiftIamUserCredentialsSchema.safeParse(
                data.credentials,
            );
            if (!result.success) {
                throw new ParameterError(
                    'Redshift IAM credentials require an assume-role ARN or AWS access keys.',
                );
            }
        }
    }

    async create(
        userUuid: string,
        data: UpsertUserWarehouseCredentials,
        projectUuid?: string,
    ): Promise<string> {
        UserWarehouseCredentialsModel.validateCredentialsForPersistence(data);
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
        UserWarehouseCredentialsModel.validateCredentialsForPersistence(data);
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

    /** Compare-and-swap on the credential's stored refreshToken. Returns true on swap. */
    async rotateRefreshToken(
        userWarehouseCredentialsUuid: string,
        expectedOldRefreshToken: string,
        newRefreshToken: string,
    ): Promise<boolean> {
        return this.database.transaction(async (trx) => {
            const row = await trx(UserWarehouseCredentialsTableName)
                .select('name', 'warehouse_type', 'encrypted_credentials')
                .where(
                    'user_warehouse_credentials_uuid',
                    userWarehouseCredentialsUuid,
                )
                .forUpdate()
                .first();
            if (!row) {
                return false;
            }

            let credentials: CreateWarehouseCredentials;
            try {
                credentials = JSON.parse(
                    this.encryptionUtil.decrypt(row.encrypted_credentials),
                ) as CreateWarehouseCredentials;
            } catch {
                return false;
            }

            const stored = (credentials as Partial<{ refreshToken: string }>)
                .refreshToken;
            if (stored !== expectedOldRefreshToken) {
                return false;
            }

            (credentials as { refreshToken: string }).refreshToken =
                newRefreshToken;
            const encryptedCredentials = this.encryptionUtil.encrypt(
                JSON.stringify(credentials),
            );
            await trx(UserWarehouseCredentialsTableName)
                .update({
                    name: row.name,
                    warehouse_type: row.warehouse_type,
                    encrypted_credentials: encryptedCredentials,
                    updated_at: new Date(),
                })
                .where(
                    'user_warehouse_credentials_uuid',
                    userWarehouseCredentialsUuid,
                );
            return true;
        });
    }
}
