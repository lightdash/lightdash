import { subject } from '@casl/ability';
import {
    AlreadyExistsError,
    createExternalSourceExplore,
    ExternalSourceStatus,
    ExternalSourceType,
    FeatureFlags,
    ForbiddenError,
    friendlyName,
    getErrorMessage,
    MissingConfigError,
    NotFoundError,
    ParameterError,
    snakeCaseName,
    SupportedDbtAdapter,
    type Account,
    type CreateExternalSourceTablePayload,
    type ExternalSource,
    type IngestExternalSourceJobPayload,
    type ResultColumns,
    type StagedExternalSourceUpload,
} from '@lightdash/common';
import {
    DuckdbWarehouseClient,
    warehouseSqlBuilderFromType,
} from '@lightdash/warehouses';
import { once } from 'events';
import { type Readable } from 'stream';
import { type S3ResultsFileStorageClient } from '../../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import { type LightdashConfig } from '../../../config/parseConfig';
import Logger from '../../../logging/logger';
import { type FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { type ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { BaseService } from '../../../services/BaseService';
import {
    getPreAggregateDuckdbLocator,
    type PreAggregateDuckdbLocator,
} from '../../../utils/duckdb/duckdbSqlTables';
import { duckdbTypeToDimensionType } from '../../../utils/duckdb/duckdbTypeToDimensionType';
import { getDuckdbRuntimeConfig } from '../../../utils/duckdb/getDuckdbRuntimeConfig';
import { type ExternalSourceModel } from '../../models/ExternalSourceModel';
import { type CommercialSchedulerClient } from '../../scheduler/SchedulerClient';

const INGEST_RESOURCE_LIMITS = { memoryLimit: '512MB', threads: 2 };
const INGEST_INSTANCE_CACHE_KEY = 'external-source-ingest';
const ERROR_MESSAGE_MAX_LENGTH = 500;
const TABLE_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

const ALLOWED_UPLOAD_CONTENT_TYPES = [
    'text/csv',
    'text/tab-separated-values',
    'text/plain',
    'application/octet-stream',
    'application/vnd.ms-excel',
];

type ExternalSourceServiceArguments = {
    lightdashConfig: LightdashConfig;
    externalSourceModel: ExternalSourceModel;
    projectModel: ProjectModel;
    featureFlagModel: FeatureFlagModel;
    schedulerClient: Pick<CommercialSchedulerClient, 'ingestExternalSource'>;
    storageClient: S3ResultsFileStorageClient;
};

export class ExternalSourceService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly externalSourceModel: ExternalSourceModel;

    private readonly projectModel: ProjectModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly schedulerClient: ExternalSourceServiceArguments['schedulerClient'];

    private readonly storageClient: S3ResultsFileStorageClient;

    constructor(args: ExternalSourceServiceArguments) {
        super({ serviceName: 'ExternalSourceService' });
        this.lightdashConfig = args.lightdashConfig;
        this.externalSourceModel = args.externalSourceModel;
        this.projectModel = args.projectModel;
        this.featureFlagModel = args.featureFlagModel;
        this.schedulerClient = args.schedulerClient;
        this.storageClient = args.storageClient;
    }

    private static rawKey(
        projectUuid: string,
        sourceUuid: string,
        version: number,
    ): string {
        return `external-sources/${projectUuid}/${sourceUuid}/raw/v${version}.csv`;
    }

    private static parquetKey(
        projectUuid: string,
        sourceUuid: string,
        tableUuid: string,
        version: number,
    ): string {
        return `external-sources/${projectUuid}/${sourceUuid}/${tableUuid}/v${version}.parquet`;
    }

    private getBucket(): string {
        const bucket = this.lightdashConfig.preAggregates.s3?.bucket;
        if (!bucket) {
            throw new MissingConfigError(
                'External sources need the pre-aggregates S3 configuration (PRE_AGGREGATE_RESULTS_S3_*)',
            );
        }
        return bucket;
    }

    private toUri(key: string): string {
        return `s3://${this.getBucket()}/${key}`;
    }

    private createIngestClient(): DuckdbWarehouseClient {
        const s3Config = getDuckdbRuntimeConfig(
            this.lightdashConfig.preAggregates.s3,
        );
        if (!s3Config) {
            throw new MissingConfigError(
                'External sources need the pre-aggregates DuckDB configuration (PRE_AGGREGATE_RESULTS_S3_*)',
            );
        }
        return DuckdbWarehouseClient.createForPreAggregate(
            { type: 'duckdb_s3', s3Config },
            {
                resourceLimits: INGEST_RESOURCE_LIMITS,
                instanceCacheKey: INGEST_INSTANCE_CACHE_KEY,
                logger: Logger,
            },
        );
    }

    private assertEngineAvailable(): void {
        if (!getDuckdbRuntimeConfig(this.lightdashConfig.preAggregates.s3)) {
            throw new MissingConfigError(
                'External sources need the pre-aggregates DuckDB configuration (PRE_AGGREGATE_RESULTS_S3_*)',
            );
        }
    }

    private async assertAccess(
        account: Account,
        projectUuid: string,
    ): Promise<{ organizationUuid: string; userUuid: string }> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const userUuid = account.user.id;

        const { enabled } = await this.featureFlagModel.get({
            user: { userUuid, organizationUuid },
            featureFlagId: FeatureFlags.ExternalSources,
        });
        if (!enabled) {
            throw new ForbiddenError('External sources are not enabled');
        }

        const ability = this.createAuditedAbility(account);
        if (
            ability.cannot(
                'manage',
                subject('ExternalSource', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to manage external sources in this project',
            );
        }
        return { organizationUuid, userUuid };
    }

    private static escapeUri(uri: string): string {
        return uri.replace(/'/g, "''");
    }

    private async describeCsv(
        client: DuckdbWarehouseClient,
        uri: string,
    ): Promise<ResultColumns> {
        const escapedUri = ExternalSourceService.escapeUri(uri);
        const { rows } = await client.runQuery(
            `SELECT column_name, column_type FROM (DESCRIBE SELECT * FROM read_csv('${escapedUri}', normalize_names=true))`,
            {},
        );
        if (rows.length === 0) {
            throw new ParameterError('The file has no columns');
        }
        return rows.reduce<ResultColumns>((acc, row) => {
            const reference = String(row.column_name);
            acc[reference] = {
                reference,
                type: duckdbTypeToDimensionType(String(row.column_type)),
            };
            return acc;
        }, {});
    }

    async stageCsvUpload(
        account: Account,
        projectUuid: string,
        input: {
            filename: string;
            contentType: string;
            contentLength: number;
            body: Readable;
        },
    ): Promise<StagedExternalSourceUpload> {
        const { userUuid } = await this.assertAccess(account, projectUuid);
        this.assertEngineAvailable();

        const baseContentType = input.contentType.split(';')[0].trim();
        if (!ALLOWED_UPLOAD_CONTENT_TYPES.includes(baseContentType)) {
            throw new ParameterError(
                'Unsupported file type. Upload a .csv or .tsv file',
            );
        }
        const maxBytes = this.lightdashConfig.externalSources.maxFileSizeBytes;
        if (input.contentLength > maxBytes) {
            throw new ParameterError(
                `File exceeds the ${Math.floor(
                    maxBytes / (1024 * 1024),
                )} MB upload limit`,
            );
        }

        const source = await this.externalSourceModel.createSource({
            projectUuid,
            type: ExternalSourceType.CSV,
            name: `_staged_${Date.now()}_${Math.random()
                .toString(36)
                .slice(2, 8)}`,
            status: ExternalSourceStatus.STAGED,
            connection: {
                type: ExternalSourceType.CSV,
                originalFilename: input.filename,
            },
            createdByUserUuid: userUuid,
        });

        const rawKey = ExternalSourceService.rawKey(
            projectUuid,
            source.sourceUuid,
            1,
        );
        const { writeStream, close } = this.storageClient.createUploadStream(
            rawKey,
            { contentType: 'text/csv' },
        );

        let totalBytes = 0;
        try {
            // eslint-disable-next-line no-restricted-syntax
            for await (const chunk of input.body) {
                const buffer = Buffer.isBuffer(chunk)
                    ? chunk
                    : Buffer.from(chunk);
                totalBytes += buffer.length;
                if (totalBytes > maxBytes) {
                    throw new ParameterError(
                        `File exceeds the ${Math.floor(
                            maxBytes / (1024 * 1024),
                        )} MB upload limit`,
                    );
                }
                if (!writeStream.write(buffer)) {
                    await once(writeStream, 'drain');
                }
            }
            if (totalBytes === 0) {
                throw new ParameterError('Upload body is empty');
            }
            await close();
        } catch (error) {
            writeStream.destroy();
            await close().catch(() => {});
            await this.externalSourceModel
                .deleteSource(projectUuid, source.sourceUuid)
                .catch(() => {});
            throw error;
        }

        const client = this.createIngestClient();
        const rawUri = this.toUri(rawKey);
        try {
            const inferredColumns = await this.describeCsv(client, rawUri);
            const escapedUri = ExternalSourceService.escapeUri(rawUri);
            const { rows: sampleRows } = await client.runQuery(
                `SELECT * FROM read_csv('${escapedUri}', normalize_names=true) LIMIT 5`,
                {},
            );
            return {
                sourceUuid: source.sourceUuid,
                inferredColumns,
                sampleRows,
                rowCountEstimate: null,
            };
        } catch (error) {
            await this.externalSourceModel
                .deleteSource(projectUuid, source.sourceUuid)
                .catch(() => {});
            throw new ParameterError(
                `Could not read the file as CSV: ${getErrorMessage(error)}`,
            );
        }
    }

    async createCsvTable(
        account: Account,
        projectUuid: string,
        sourceUuid: string,
        payload: CreateExternalSourceTablePayload,
    ): Promise<ExternalSource> {
        const { organizationUuid, userUuid } = await this.assertAccess(
            account,
            projectUuid,
        );

        const source = await this.externalSourceModel.getSource(
            projectUuid,
            sourceUuid,
        );
        if (source.status !== ExternalSourceStatus.STAGED) {
            throw new ParameterError('This upload has already been committed');
        }

        const tableName = snakeCaseName(payload.tableName);
        if (!TABLE_NAME_PATTERN.test(tableName)) {
            throw new ParameterError(
                'Table name must start with a letter and contain only lowercase letters, numbers, and underscores',
            );
        }

        const existingExplore = await this.projectModel.findExploreByTableName(
            projectUuid,
            tableName,
        );
        if (existingExplore) {
            throw new AlreadyExistsError(
                `A table named "${tableName}" already exists in this project`,
            );
        }
        const existingSource = await this.externalSourceModel.findSourceByName(
            projectUuid,
            tableName,
        );
        if (existingSource) {
            throw new AlreadyExistsError(
                `An external source named "${tableName}" already exists in this project`,
            );
        }

        const label = payload.label?.trim() || friendlyName(tableName);
        await this.externalSourceModel.updateSource(sourceUuid, {
            name: tableName,
            status: ExternalSourceStatus.SYNCING,
            error_message: null,
        });
        await this.externalSourceModel.createTable({
            sourceUuid,
            projectUuid,
            name: tableName,
            label,
        });

        await this.schedulerClient.ingestExternalSource({
            organizationUuid,
            projectUuid,
            userUuid,
            sourceUuid,
        });

        return this.externalSourceModel.getSource(projectUuid, sourceUuid);
    }

    async list(
        account: Account,
        projectUuid: string,
    ): Promise<ExternalSource[]> {
        await this.assertAccess(account, projectUuid);
        const sources = await this.externalSourceModel.listSources(projectUuid);
        return sources.filter(
            (source) => source.status !== ExternalSourceStatus.STAGED,
        );
    }

    async get(
        account: Account,
        projectUuid: string,
        sourceUuid: string,
    ): Promise<ExternalSource> {
        await this.assertAccess(account, projectUuid);
        return this.externalSourceModel.getSource(projectUuid, sourceUuid);
    }

    async delete(
        account: Account,
        projectUuid: string,
        sourceUuid: string,
    ): Promise<void> {
        await this.assertAccess(account, projectUuid);
        const { source, tables } =
            await this.externalSourceModel.getSourceRowsForIngest(
                projectUuid,
                sourceUuid,
            );
        await Promise.all(
            tables.map((table) =>
                this.projectModel
                    .deleteExternalSourceExplore(projectUuid, table.name)
                    .catch((error) => {
                        this.logger.warn(
                            `Failed to delete explore for external source table ${
                                table.name
                            }: ${getErrorMessage(error)}`,
                        );
                    }),
            ),
        );
        await this.externalSourceModel.deleteSource(
            projectUuid,
            source.external_source_uuid,
        );
    }

    /**
     * Worker entry point: parse the raw file, write typed parquet, generate
     * the explore, and flip the source to ready. Any failure lands on the
     * source row as an error status.
     */
    async runIngest(payload: IngestExternalSourceJobPayload): Promise<void> {
        const { projectUuid, sourceUuid } = payload;
        try {
            const { source, tables } =
                await this.externalSourceModel.getSourceRowsForIngest(
                    projectUuid,
                    sourceUuid,
                );
            const table = tables[0];
            if (!table) {
                throw new NotFoundError(
                    'External source has no table to ingest',
                );
            }

            const client = this.createIngestClient();
            const buildVersion = table.version + 1;
            const rawUri = this.toUri(
                ExternalSourceService.rawKey(
                    projectUuid,
                    sourceUuid,
                    buildVersion,
                ),
            );
            const parquetKey = ExternalSourceService.parquetKey(
                projectUuid,
                sourceUuid,
                table.external_source_table_uuid,
                buildVersion,
            );
            const parquetUri = this.toUri(parquetKey);
            const escapedRawUri = ExternalSourceService.escapeUri(rawUri);
            const escapedParquetUri =
                ExternalSourceService.escapeUri(parquetUri);

            await client.runSql(
                `COPY (SELECT * FROM read_csv('${escapedRawUri}', normalize_names=true, sample_size=-1)) TO '${escapedParquetUri}' (FORMAT PARQUET, COMPRESSION zstd, ROW_GROUP_SIZE 100000)`,
            );

            const { rows: describeRows } = await client.runQuery(
                `SELECT column_name, column_type FROM (DESCRIBE SELECT * FROM read_parquet('${escapedParquetUri}'))`,
                {},
            );
            const columns = describeRows.reduce<ResultColumns>((acc, row) => {
                const reference = String(row.column_name);
                acc[reference] = {
                    reference,
                    type: duckdbTypeToDimensionType(String(row.column_type)),
                };
                return acc;
            }, {});

            const { rows: countRows } = await client.runQuery(
                `SELECT COUNT(*) AS row_count FROM read_parquet('${escapedParquetUri}')`,
                {},
            );
            const rowCount = Number(countRows[0]?.row_count ?? 0);
            const totalBytes = await this.storageClient.getFileSize(
                parquetKey,
                'parquet',
            );

            const explore = createExternalSourceExplore({
                name: table.name,
                label: table.label,
                columns,
                externalSource: {
                    sourceUuid,
                    tableUuid: table.external_source_table_uuid,
                    sourceType: source.type,
                },
                warehouseSqlBuilder: warehouseSqlBuilderFromType(
                    SupportedDbtAdapter.DUCKDB,
                ),
            });

            if (table.version === 0) {
                await this.projectModel.createExternalSourceExplore(
                    projectUuid,
                    explore,
                );
            } else {
                await this.projectModel.updateExternalSourceExplore(
                    projectUuid,
                    table.name,
                    explore,
                );
            }

            const locator: PreAggregateDuckdbLocator =
                getPreAggregateDuckdbLocator({
                    uri: parquetUri,
                    format: 'parquet',
                });
            await this.externalSourceModel.updateTableIngest(
                table.external_source_table_uuid,
                { columns, locator, rowCount, totalBytes },
            );
            await this.externalSourceModel.updateSource(sourceUuid, {
                status: ExternalSourceStatus.READY,
                error_message: null,
                last_refreshed_at: new Date(),
            });
        } catch (error) {
            const message = getErrorMessage(error).slice(
                0,
                ERROR_MESSAGE_MAX_LENGTH,
            );
            this.logger.error(
                `External source ingest failed for ${sourceUuid}: ${message}`,
            );
            await this.externalSourceModel
                .updateSource(sourceUuid, {
                    status: ExternalSourceStatus.ERROR,
                    error_message: message,
                })
                .catch(() => {});
            throw error;
        }
    }
}
