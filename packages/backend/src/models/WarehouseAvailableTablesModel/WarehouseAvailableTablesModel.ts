import {
    isWarehouseTableType,
    NotFoundError,
    UnexpectedServerError,
    UserWarehouseCredentialPurpose,
    WarehouseCatalog,
    WarehouseTables,
    WarehouseTablesCatalog,
} from '@lightdash/common';
import { Knex } from 'knex';
import { validate as isValidUuid } from 'uuid';
import { AiAgentWarehouseTableListsTableName } from '../../database/entities/aiAgentWarehouseTableLists';
import { AiServiceAccountCredentialsTableName } from '../../database/entities/aiServiceAccountCredentials';
import { ProjectTableName } from '../../database/entities/projects';
import { UserTableName } from '../../database/entities/users';
import { UserWarehouseCredentialsTableName } from '../../database/entities/userWarehouseCredentials';
import {
    DbWarehouseAvailableTables,
    WarehouseAvailableTablesTableName,
} from '../../database/entities/warehouseAvailableTables';

export type AgentTableListOwner =
    | {
          kind: 'agent_sign_in';
          userUuid: string;
          userWarehouseCredentialsUuid: string;
      }
    | { kind: 'ai_service_account'; slotUuid: string; identityUuid: string };

export type AgentTableListKey = {
    owner: AgentTableListOwner;
    projectUuid: string;
    scopeFingerprint: string;
};

const isUuid = (value: unknown): value is string =>
    typeof value === 'string' && isValidUuid(value);

const assertAgentTableListKey = (key: AgentTableListKey) => {
    const owner = key?.owner;
    const validOwner =
        (owner?.kind === 'agent_sign_in' &&
            isUuid(owner.userUuid) &&
            isUuid(owner.userWarehouseCredentialsUuid)) ||
        (owner?.kind === 'ai_service_account' &&
            isUuid(owner.slotUuid) &&
            isUuid(owner.identityUuid));
    if (
        !validOwner ||
        !isUuid(key.projectUuid) ||
        typeof key.scopeFingerprint !== 'string' ||
        !/^[0-9a-f]{64}$/.test(key.scopeFingerprint)
    ) {
        throw new UnexpectedServerError('Invalid agent table list key');
    }
};

const agentTableListOwnerColumns = (owner: AgentTableListOwner) =>
    owner.kind === 'agent_sign_in'
        ? {
              owner_kind: owner.kind,
              user_uuid: owner.userUuid,
              ai_service_account_credential_uuid: null,
              credential_generation: owner.userWarehouseCredentialsUuid,
          }
        : {
              owner_kind: owner.kind,
              user_uuid: null,
              ai_service_account_credential_uuid: owner.slotUuid,
              credential_generation: owner.identityUuid,
          };

export class WarehouseAvailableTablesModel {
    database: Knex;

    constructor(database: Knex) {
        this.database = database;
    }

    static toWarehouseCatalog(
        rows: Pick<
            DbWarehouseAvailableTables,
            'database' | 'schema' | 'table' | 'partition_column' | 'table_type'
        >[],
    ): WarehouseTablesCatalog {
        return rows.reduce((acc, row) => {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            const { database, schema, table, partition_column, table_type } =
                row;
            if (!acc[database]) {
                acc[database] = {};
            }
            if (!acc[database][schema]) {
                acc[database][schema] = {};
            }
            acc[database][schema][table] = {
                partitionColumn: partition_column || undefined,
                // Rows cached before the column existed have no type
                tableType: isWarehouseTableType(table_type)
                    ? table_type
                    : undefined,
            };
            return acc;
        }, {} as WarehouseTablesCatalog);
    }

    async getTablesForUserWarehouseCredentials(
        userWarehouseCredentialsId: string,
    ) {
        const rows = await this.database(WarehouseAvailableTablesTableName)
            .where(
                'user_warehouse_credentials_uuid',
                userWarehouseCredentialsId,
            )
            .select([
                'database',
                'schema',
                'table',
                'partition_column',
                'table_type',
            ]);
        return WarehouseAvailableTablesModel.toWarehouseCatalog(rows);
    }

    async getTablesForProjectWarehouseCredentials(projectUuid: string) {
        const rows = await this.database('projects')
            .join(
                'warehouse_credentials',
                'projects.project_id',
                'warehouse_credentials.project_id',
            )
            .join(
                WarehouseAvailableTablesTableName,
                'warehouse_credentials.warehouse_credentials_id',
                `${WarehouseAvailableTablesTableName}.project_warehouse_credentials_id`,
            )
            .where('project_uuid', projectUuid)
            .select([
                'database',
                'schema',
                'table',
                'partition_column',
                'table_type',
            ]);
        return WarehouseAvailableTablesModel.toWarehouseCatalog(rows);
    }

    async createAvailableTablesForProjectWarehouseCredentials(
        projectUuid: string,
        tables: WarehouseTables,
    ) {
        const warehouseCredentialsId = await this.database(
            'warehouse_credentials',
        )
            .join(
                'projects',
                'projects.project_id',
                'warehouse_credentials.project_id',
            )
            .where('project_uuid', projectUuid)
            .select('warehouse_credentials_id')
            .first();

        if (!warehouseCredentialsId) {
            throw new NotFoundError('Warehouse credentials not found');
        }
        const rows = tables.map(
            ({ database, schema, table, partitionColumn, tableType }) => ({
                database,
                schema,
                table,
                project_warehouse_credentials_id:
                    warehouseCredentialsId.warehouse_credentials_id,
                user_warehouse_credentials_uuid: null,
                partition_column: partitionColumn || null,
                table_type: tableType,
            }),
        );

        await this.database.transaction(async (trx) => {
            await trx(WarehouseAvailableTablesTableName)
                .where(
                    'project_warehouse_credentials_id',
                    warehouseCredentialsId.warehouse_credentials_id,
                )
                .del();

            if (rows.length !== 0) {
                await trx.batchInsert(WarehouseAvailableTablesTableName, rows);
            }
        });
    }

    async createAvailableTablesForUserWarehouseCredentials(
        userWarehouseCredentialsUuid: string,
        tables: WarehouseTables,
    ) {
        const rows = tables.map(
            ({ database, schema, table, partitionColumn, tableType }) => ({
                database,
                schema,
                table,
                partition_column: partitionColumn || null,
                table_type: tableType,
                project_warehouse_credentials_id: null,
                user_warehouse_credentials_uuid: userWarehouseCredentialsUuid,
            }),
        );
        await this.database.transaction(async (trx) => {
            await trx(WarehouseAvailableTablesTableName)
                .where(
                    'user_warehouse_credentials_uuid',
                    userWarehouseCredentialsUuid,
                )
                .del();
            if (rows.length !== 0) {
                await trx.batchInsert(WarehouseAvailableTablesTableName, rows);
            }
        });
    }

    async getAgentTableList(
        key: AgentTableListKey,
    ): Promise<WarehouseTablesCatalog | null> {
        assertAgentTableListKey(key);
        const row = await this.database(AiAgentWarehouseTableListsTableName)
            .where({
                ...agentTableListOwnerColumns(key.owner),
                project_uuid: key.projectUuid,
                scope_fingerprint: key.scopeFingerprint,
            })
            .first('tables');
        return row?.tables ?? null;
    }

    async saveAgentTableList(
        key: AgentTableListKey,
        tables: WarehouseTablesCatalog,
    ): Promise<'saved' | 'stale'> {
        assertAgentTableListKey(key);
        const { owner } = key;
        return this.database.transaction(async (trx) => {
            if (owner.kind === 'agent_sign_in') {
                const user = await trx(UserTableName)
                    .where('user_uuid', owner.userUuid)
                    .forKeyShare()
                    .first('user_uuid');
                if (!user) return 'stale';
            }
            const project = await trx(ProjectTableName)
                .where('project_uuid', key.projectUuid)
                .forKeyShare()
                .first('project_uuid');
            if (!project) return 'stale';
            const current =
                owner.kind === 'agent_sign_in'
                    ? await trx(UserWarehouseCredentialsTableName)
                          .where({
                              user_warehouse_credentials_uuid:
                                  owner.userWarehouseCredentialsUuid,
                              user_uuid: owner.userUuid,
                              purpose: UserWarehouseCredentialPurpose.AI,
                          })
                          .forKeyShare()
                          .first('user_warehouse_credentials_uuid')
                    : await trx(AiServiceAccountCredentialsTableName)
                          .where({
                              ai_service_account_credential_uuid:
                                  owner.slotUuid,
                              identity_uuid: owner.identityUuid,
                          })
                          .forKeyShare()
                          .first('ai_service_account_credential_uuid');
            if (!current) return 'stale';
            const columns = agentTableListOwnerColumns(owner);
            await trx(AiAgentWarehouseTableListsTableName)
                .insert({
                    ...columns,
                    project_uuid: key.projectUuid,
                    scope_fingerprint: key.scopeFingerprint,
                    tables,
                })
                .onConflict(
                    owner.kind === 'agent_sign_in'
                        ? ['user_uuid', 'project_uuid', 'scope_fingerprint']
                        : [
                              'ai_service_account_credential_uuid',
                              'project_uuid',
                              'scope_fingerprint',
                          ],
                )
                .merge({
                    credential_generation: columns.credential_generation,
                    tables,
                    updated_at: new Date(),
                });
            return 'saved';
        });
    }
}
