import {
    assertUnreachable,
    DuckdbConnectionType,
    normalizeWarehouseCredentials,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { type Knex } from 'knex';
import {
    WarehouseCredentialTableName,
    warehouseTypeDisplayNames,
    type WarehouseType,
} from '../../database/entities/warehouseCredentials';
import { type EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';

export const CONNECTION_NAME_BACKFILL_BATCH_SIZE = 200;

export type ConnectionNameBackfillOptions = {
    dryRun: boolean;
    fromId: number;
};

export type ConnectionNameBackfillRow = {
    warehouseCredentialsId: number;
    projectId: number;
    warehouseType: WarehouseType;
    name: string;
    organizationWarehouseCredentialsUuid: string | null;
    encryptedCredentials: Buffer | null;
    organizationWarehouseConnection: Buffer | null;
};

export type RenameResult = 'renamed' | 'concurrent-rename' | 'collision';

export type ConnectionNameBackfillDatabase = {
    fetchRows: (
        afterId: number,
        limit: number,
    ) => Promise<ConnectionNameBackfillRow[]>;
    getLiveNames: (projectId: number) => Promise<string[]>;
    renameIfDefault: (
        row: ConnectionNameBackfillRow,
        newName: string,
    ) => Promise<RenameResult>;
};

export type ConnectionNameBackfillSkipReason =
    | 'concurrent-rename'
    | 'decrypt-failed'
    | 'missing-credentials'
    | 'missing-name'
    | 'unchanged';

export type ConnectionNameBackfillReport = {
    mode: 'dry-run' | 'execute';
    processed: number;
    renamed: number;
    skipped: Record<ConnectionNameBackfillSkipReason, number>;
};

export const deriveConnectionName = (
    credentials: CreateWarehouseCredentials,
): string | undefined => {
    switch (credentials.type) {
        case WarehouseTypes.ATHENA:
            return `${credentials.database} ${credentials.region}`;
        case WarehouseTypes.BIGQUERY:
            return credentials.project;
        case WarehouseTypes.SNOWFLAKE:
            return credentials.database;
        case WarehouseTypes.DATABRICKS:
            return credentials.catalog;
        case WarehouseTypes.TRINO:
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.REDSHIFT:
            return credentials.dbname;
        case WarehouseTypes.CLICKHOUSE:
            return credentials.schema;
        case WarehouseTypes.DUCKDB:
            switch (credentials.connectionType) {
                case DuckdbConnectionType.ANALYTICS:
                    return credentials.database;
                case DuckdbConnectionType.DUCKLAKE:
                    return credentials.catalogAlias ?? 'ducklake';
                case DuckdbConnectionType.EMBEDDED:
                    return credentials.dataset;
                case DuckdbConnectionType.MOTHERDUCK:
                    return credentials.database;
                default:
                    return assertUnreachable(
                        credentials,
                        'Unknown DuckDB connection type',
                    );
            }
        default:
            return assertUnreachable(credentials, 'Unknown warehouse type');
    }
};

const isUniqueViolation = (error: unknown): boolean =>
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === '23505';

export const createConnectionNameBackfillDatabase = (
    database: Knex,
): ConnectionNameBackfillDatabase => ({
    fetchRows: async (afterId, limit) => {
        const rows = await database(`${WarehouseCredentialTableName} as wc`)
            .innerJoin('projects as p', 'wc.project_id', 'p.project_id')
            .innerJoin(
                'organizations as o',
                'p.organization_id',
                'o.organization_id',
            )
            .leftJoin(
                'organization_warehouse_credentials as owc',
                function joinOrganizationWarehouseCredentials() {
                    this.on(
                        'owc.organization_warehouse_credentials_uuid',
                        '=',
                        'wc.organization_warehouse_credentials_uuid',
                    ).andOn(
                        'owc.organization_uuid',
                        '=',
                        'o.organization_uuid',
                    );
                },
            )
            .select({
                warehouseCredentialsId: 'wc.warehouse_credentials_id',
                projectId: 'wc.project_id',
                warehouseType: 'wc.warehouse_type',
                name: 'wc.name',
                organizationWarehouseCredentialsUuid:
                    'wc.organization_warehouse_credentials_uuid',
                encryptedCredentials: 'wc.encrypted_credentials',
                organizationWarehouseConnection: 'owc.warehouse_connection',
            })
            .whereNull('wc.superseded_at')
            .where('wc.warehouse_credentials_id', '>', afterId)
            .whereIn(
                ['wc.warehouse_type', 'wc.name'],
                Object.entries(warehouseTypeDisplayNames),
            )
            .orderBy('wc.warehouse_credentials_id', 'asc')
            .limit(limit);
        return rows as ConnectionNameBackfillRow[];
    },
    getLiveNames: async (projectId) => {
        const rows = await database(WarehouseCredentialTableName)
            .select('name')
            .where({ project_id: projectId })
            .whereNull('superseded_at');
        return rows.map(({ name }) => name);
    },
    renameIfDefault: async (row, newName) => {
        try {
            const updated = await database(WarehouseCredentialTableName)
                .where({
                    warehouse_credentials_id: row.warehouseCredentialsId,
                    name: warehouseTypeDisplayNames[row.warehouseType],
                })
                .whereNull('superseded_at')
                .update({ name: newName });
            return updated > 0 ? 'renamed' : 'concurrent-rename';
        } catch (error) {
            if (isUniqueViolation(error)) {
                return 'collision';
            }
            throw error;
        }
    },
});

const createSkippedCounts = (): ConnectionNameBackfillReport['skipped'] => ({
    'concurrent-rename': 0,
    'decrypt-failed': 0,
    'missing-credentials': 0,
    'missing-name': 0,
    unchanged: 0,
});

const nextAvailableName = (baseName: string, names: Set<string>): string => {
    if (!names.has(baseName)) {
        return baseName;
    }
    let suffix = 2;
    while (names.has(`${baseName} ${suffix}`)) {
        suffix += 1;
    }
    return `${baseName} ${suffix}`;
};

const decryptCredentials = (
    row: ConnectionNameBackfillRow,
    encryptionUtil: Pick<EncryptionUtil, 'decrypt'>,
): CreateWarehouseCredentials | null => {
    const ciphertext = row.organizationWarehouseCredentialsUuid
        ? row.organizationWarehouseConnection
        : row.encryptedCredentials;
    if (!ciphertext) {
        return null;
    }
    return normalizeWarehouseCredentials(
        JSON.parse(
            encryptionUtil.decrypt(ciphertext),
        ) as CreateWarehouseCredentials,
    );
};

export const runConnectionNameBackfill = async (
    database: ConnectionNameBackfillDatabase,
    encryptionUtil: Pick<EncryptionUtil, 'decrypt'>,
    options: ConnectionNameBackfillOptions,
    log: (line: string) => void = console.log,
): Promise<ConnectionNameBackfillReport> => {
    const report: ConnectionNameBackfillReport = {
        mode: options.dryRun ? 'dry-run' : 'execute',
        processed: 0,
        renamed: 0,
        skipped: createSkippedCounts(),
    };
    const reservedNames = new Map<number, Set<string>>();
    const renameWithCollisionRetry = async (
        row: ConnectionNameBackfillRow,
        baseName: string,
        projectNames: Set<string>,
        newName: string,
    ): Promise<void> => {
        const result = await database.renameIfDefault(row, newName);
        if (result === 'collision') {
            projectNames.add(newName);
            await renameWithCollisionRetry(
                row,
                baseName,
                projectNames,
                nextAvailableName(baseName, projectNames),
            );
            return;
        }
        if (result === 'concurrent-rename') {
            report.skipped['concurrent-rename'] += 1;
            log(
                `Skipped connection ${row.warehouseCredentialsId}: concurrent-rename`,
            );
            return;
        }
        projectNames.add(newName);
        report.renamed += 1;
        log(
            `Renamed connection ${row.warehouseCredentialsId}: ${row.name} -> ${newName}`,
        );
    };

    const processRow = async (
        row: ConnectionNameBackfillRow,
    ): Promise<void> => {
        report.processed += 1;
        let credentials: CreateWarehouseCredentials | null;
        try {
            credentials = decryptCredentials(row, encryptionUtil);
        } catch {
            report.skipped['decrypt-failed'] += 1;
            log(
                `Skipped connection ${row.warehouseCredentialsId}: decrypt-failed`,
            );
            return;
        }
        if (!credentials) {
            report.skipped['missing-credentials'] += 1;
            log(
                `Skipped connection ${row.warehouseCredentialsId}: missing-credentials`,
            );
            return;
        }

        const baseName = deriveConnectionName(credentials)?.trim();
        if (!baseName) {
            report.skipped['missing-name'] += 1;
            log(
                `Skipped connection ${row.warehouseCredentialsId}: missing-name`,
            );
            return;
        }
        if (baseName === row.name) {
            report.skipped.unchanged += 1;
            return;
        }

        let projectNames = reservedNames.get(row.projectId);
        if (!projectNames) {
            projectNames = new Set(await database.getLiveNames(row.projectId));
            reservedNames.set(row.projectId, projectNames);
        }

        const newName = nextAvailableName(baseName, projectNames);
        if (options.dryRun) {
            projectNames.add(newName);
            report.renamed += 1;
            log(
                `Would rename connection ${row.warehouseCredentialsId}: ${row.name} -> ${newName}`,
            );
            return;
        }

        await renameWithCollisionRetry(row, baseName, projectNames, newName);
    };

    const processRows = async (
        rows: ConnectionNameBackfillRow[],
        index = 0,
    ): Promise<void> => {
        if (index >= rows.length) {
            return;
        }
        await processRow(rows[index]);
        await processRows(rows, index + 1);
    };

    const processBatch = async (cursor: number): Promise<void> => {
        const rows = await database.fetchRows(
            cursor,
            CONNECTION_NAME_BACKFILL_BATCH_SIZE,
        );
        if (rows.length === 0) {
            return;
        }
        await processRows(rows);

        const nextCursor = rows[rows.length - 1].warehouseCredentialsId;
        const skipped = Object.values(report.skipped).reduce(
            (total, count) => total + count,
            0,
        );
        log(
            `Progress: throughId=${nextCursor} processed=${report.processed} renamed=${report.renamed} skipped=${skipped}`,
        );
        await processBatch(nextCursor);
    };

    await processBatch(options.fromId);

    return report;
};
