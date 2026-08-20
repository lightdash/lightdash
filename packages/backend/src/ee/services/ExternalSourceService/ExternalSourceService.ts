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
    OpenIdIdentityIssuerType,
    ParameterError,
    parseGoogleSheetsSpreadsheetId,
    snakeCaseName,
    SupportedDbtAdapter,
    type CreateExternalSourceTablePayload,
    type CreateGoogleSheetsSourcePayload,
    type ExternalSource,
    type ExternalSourceTablePreview,
    type IngestExternalSourceJobPayload,
    type RegisteredAccount,
    type ResultColumns,
    type StagedExternalSourceUpload,
    type UpdateExternalSourcePayload,
    type UUID,
} from '@lightdash/common';
import {
    DuckdbWarehouseClient,
    warehouseSqlBuilderFromType,
} from '@lightdash/warehouses';
import { stringify } from 'csv-stringify/sync';
import { once } from 'events';
import { Readable } from 'stream';
import { type GoogleDriveClient } from '../../../clients/Google/GoogleDriveClient';
import { type S3ResultsFileStorageClient } from '../../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import { type LightdashConfig } from '../../../config/parseConfig';
import Logger from '../../../logging/logger';
import { type FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { type ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { type UserOAuthGrantsModel } from '../../../models/UserOAuthGrantsModel';
import { BaseService } from '../../../services/BaseService';
import {
    getPreAggregateDuckdbLocator,
    type PreAggregateDuckdbLocator,
} from '../../../utils/duckdb/duckdbSqlTables';
import { duckdbTypeToDimensionType } from '../../../utils/duckdb/duckdbTypeToDimensionType';
import { getDuckdbRuntimeConfig } from '../../../utils/duckdb/getDuckdbRuntimeConfig';
import { sanitizeDuckdbError } from '../../../utils/duckdb/sanitizeDuckdbError';
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
    googleDriveClient: GoogleDriveClient;
    userOAuthGrantsModel: Pick<UserOAuthGrantsModel, 'getRefreshToken'>;
};

type ExternalSourceUploadInput = {
    filename: string;
    contentType: string;
    contentLength: number;
    body: Readable;
};

export class ExternalSourceService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly externalSourceModel: ExternalSourceModel;

    private readonly projectModel: ProjectModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly schedulerClient: ExternalSourceServiceArguments['schedulerClient'];

    private readonly storageClient: S3ResultsFileStorageClient;

    private readonly googleDriveClient: GoogleDriveClient;

    private readonly userOAuthGrantsModel: Pick<
        UserOAuthGrantsModel,
        'getRefreshToken'
    >;

    constructor(args: ExternalSourceServiceArguments) {
        super({ serviceName: 'ExternalSourceService' });
        this.lightdashConfig = args.lightdashConfig;
        this.externalSourceModel = args.externalSourceModel;
        this.projectModel = args.projectModel;
        this.featureFlagModel = args.featureFlagModel;
        this.schedulerClient = args.schedulerClient;
        this.storageClient = args.storageClient;
        this.googleDriveClient = args.googleDriveClient;
        this.userOAuthGrantsModel = args.userOAuthGrantsModel;
    }

    private static rawKey(
        projectUuid: UUID,
        sourceUuid: UUID,
        version: number,
    ): string {
        return `external-sources/${projectUuid}/${sourceUuid}/raw/v${version}.csv`;
    }

    private static parquetKey(
        projectUuid: UUID,
        sourceUuid: UUID,
        tableUuid: UUID,
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

    private getMaxUploadBytes(): number {
        return this.lightdashConfig.externalSources.maxFileSizeBytes;
    }

    private getMaxUploadMegabytes(): number {
        return Math.floor(this.getMaxUploadBytes() / (1024 * 1024));
    }

    private assertValidUpload(input: ExternalSourceUploadInput): void {
        const baseContentType = input.contentType.split(';')[0].trim();
        if (!ALLOWED_UPLOAD_CONTENT_TYPES.includes(baseContentType)) {
            throw new ParameterError(
                'Unsupported file type. Upload a .csv or .tsv file',
            );
        }
        if (input.contentLength > this.getMaxUploadBytes()) {
            throw new ParameterError(
                `File exceeds the ${this.getMaxUploadMegabytes()} MB upload limit`,
            );
        }
    }

    private async uploadRawFile(key: string, body: Readable): Promise<number> {
        const { writeStream, close } = this.storageClient.createUploadStream(
            key,
            { contentType: 'text/csv' },
        );
        let totalBytes = 0;
        try {
            // eslint-disable-next-line no-restricted-syntax
            for await (const chunk of body) {
                const buffer = Buffer.isBuffer(chunk)
                    ? chunk
                    : Buffer.from(chunk);
                totalBytes += buffer.length;
                if (totalBytes > this.getMaxUploadBytes()) {
                    throw new ParameterError(
                        `File exceeds the ${this.getMaxUploadMegabytes()} MB upload limit`,
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
            return totalBytes;
        } catch (error) {
            writeStream.destroy();
            await close().catch(() => {});
            throw error;
        }
    }

    private async assertAccess(
        account: RegisteredAccount,
        projectUuid: UUID,
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
        account: RegisteredAccount,
        projectUuid: UUID,
        input: ExternalSourceUploadInput,
    ): Promise<StagedExternalSourceUpload> {
        const { userUuid } = await this.assertAccess(account, projectUuid);
        this.assertEngineAvailable();
        this.assertValidUpload(input);

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
        try {
            await this.uploadRawFile(rawKey, input.body);
        } catch (error) {
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
                `Could not read the file as CSV: ${sanitizeDuckdbError(error)}`,
            );
        }
    }

    private async validateNewTableName(
        projectUuid: UUID,
        rawName: string,
    ): Promise<string> {
        const tableName = snakeCaseName(rawName);
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
        return tableName;
    }

    private async getGoogleRefreshToken(userUuid: string): Promise<string> {
        try {
            return await this.userOAuthGrantsModel.getRefreshToken(
                userUuid,
                OpenIdIdentityIssuerType.GOOGLE,
            );
        } catch (error) {
            throw new ParameterError(
                'Connect your Google account to read Google Sheets, then try again',
            );
        }
    }

    private async enqueueIngest(
        payload: IngestExternalSourceJobPayload,
    ): Promise<void> {
        try {
            await this.schedulerClient.ingestExternalSource(payload);
        } catch (error) {
            await this.markIngestError(payload.sourceUuid, error).catch(
                () => {},
            );
            throw error;
        }
    }

    async createGoogleSheetsSource(
        account: RegisteredAccount,
        projectUuid: UUID,
        payload: CreateGoogleSheetsSourcePayload,
    ): Promise<ExternalSource> {
        const { organizationUuid, userUuid } = await this.assertAccess(
            account,
            projectUuid,
        );
        this.assertEngineAvailable();

        const spreadsheetId = parseGoogleSheetsSpreadsheetId(payload.url);
        if (!spreadsheetId) {
            throw new ParameterError(
                'That does not look like a Google Sheets link. Paste the sheet URL from your browser',
            );
        }
        const tableName = await this.validateNewTableName(
            projectUuid,
            payload.tableName,
        );
        const label = payload.label?.trim() || friendlyName(tableName);

        const refreshToken = await this.getGoogleRefreshToken(userUuid);
        await this.googleDriveClient.assertFileIsGoogleSheet(
            refreshToken,
            spreadsheetId,
        );
        const tabs = await this.googleDriveClient.listSheetTabs(
            refreshToken,
            spreadsheetId,
        );
        const tabName = payload.tabName?.trim() || tabs[0];
        if (!tabName || (payload.tabName && !tabs.includes(tabName))) {
            throw new ParameterError(
                'The sheet has no readable tab with that name',
            );
        }

        const source = await this.externalSourceModel.createSource({
            projectUuid,
            type: ExternalSourceType.GOOGLE_SHEETS,
            name: tableName,
            status: ExternalSourceStatus.SYNCING,
            connection: {
                type: ExternalSourceType.GOOGLE_SHEETS,
                spreadsheetId,
                tabName,
            },
            createdByUserUuid: userUuid,
        });
        const table = await this.externalSourceModel.createTable({
            sourceUuid: source.sourceUuid,
            projectUuid,
            name: tableName,
            label,
        });
        await this.enqueueIngest({
            organizationUuid,
            projectUuid,
            userUuid,
            sourceUuid: source.sourceUuid,
            ingestVersion: table.version + 1,
        });
        return this.externalSourceModel.getSource(
            projectUuid,
            source.sourceUuid,
        );
    }

    /** Re-read the connected sheet and re-ingest. Google Sheets sources only. */
    async refresh(
        account: RegisteredAccount,
        projectUuid: UUID,
        sourceUuid: UUID,
    ): Promise<ExternalSource> {
        const { organizationUuid, userUuid } = await this.assertAccess(
            account,
            projectUuid,
        );
        this.assertEngineAvailable();
        const source = await this.externalSourceModel.getSource(
            projectUuid,
            sourceUuid,
        );
        if (source.type !== ExternalSourceType.GOOGLE_SHEETS) {
            throw new ParameterError(
                'Only Google Sheets sources can be refreshed. Replace the file instead',
            );
        }
        if (source.status === ExternalSourceStatus.SYNCING) {
            throw new ParameterError(
                'This source is already ingesting. Wait for it to finish and try again',
            );
        }
        const table = source.tables[0];
        if (!table) {
            throw new NotFoundError('External source has no table');
        }
        await this.externalSourceModel.updateSource(sourceUuid, {
            status: ExternalSourceStatus.SYNCING,
            error_message: null,
        });
        await this.enqueueIngest({
            organizationUuid,
            projectUuid,
            userUuid,
            sourceUuid,
            ingestVersion: table.version + 1,
        });
        return this.externalSourceModel.getSource(projectUuid, sourceUuid);
    }

    async createCsvTable(
        account: RegisteredAccount,
        projectUuid: UUID,
        sourceUuid: UUID,
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

        const tableName = await this.validateNewTableName(
            projectUuid,
            payload.tableName,
        );
        const label = payload.label?.trim() || friendlyName(tableName);
        await this.externalSourceModel.updateSource(sourceUuid, {
            name: tableName,
            status: ExternalSourceStatus.SYNCING,
            error_message: null,
        });
        const table = await this.externalSourceModel.createTable({
            sourceUuid,
            projectUuid,
            name: tableName,
            label,
        });

        await this.enqueueIngest({
            organizationUuid,
            projectUuid,
            userUuid,
            sourceUuid,
            ingestVersion: table.version + 1,
        });

        return this.externalSourceModel.getSource(projectUuid, sourceUuid);
    }

    async list(
        account: RegisteredAccount,
        projectUuid: UUID,
    ): Promise<ExternalSource[]> {
        await this.assertAccess(account, projectUuid);
        const sources = await this.externalSourceModel.listSources(projectUuid);
        return sources.filter(
            (source) => source.status !== ExternalSourceStatus.STAGED,
        );
    }

    async get(
        account: RegisteredAccount,
        projectUuid: UUID,
        sourceUuid: UUID,
    ): Promise<ExternalSource> {
        await this.assertAccess(account, projectUuid);
        return this.externalSourceModel.getSource(projectUuid, sourceUuid);
    }

    /**
     * Rename changes the label everywhere (source list, sidebar, explore);
     * the sql name stays stable so saved charts keep working. The explore is
     * rebuilt from the stored schema — no re-ingest.
     */
    async rename(
        account: RegisteredAccount,
        projectUuid: UUID,
        sourceUuid: UUID,
        payload: UpdateExternalSourcePayload,
    ): Promise<ExternalSource> {
        await this.assertAccess(account, projectUuid);
        const label = payload.label.trim();
        if (label.length === 0) {
            throw new ParameterError('Give the table a name');
        }
        const { source, tables } =
            await this.externalSourceModel.getSourceRowsForIngest(
                projectUuid,
                sourceUuid,
            );
        const table = tables[0];
        if (!table) {
            throw new NotFoundError('External source has no table');
        }
        await this.externalSourceModel.updateTableLabel(
            table.external_source_table_uuid,
            label,
        );
        if (table.columns) {
            const explore = createExternalSourceExplore({
                name: table.name,
                label,
                columns: table.columns,
                externalSource: {
                    sourceUuid,
                    tableUuid: table.external_source_table_uuid,
                    sourceType: source.type,
                },
                warehouseSqlBuilder: warehouseSqlBuilderFromType(
                    SupportedDbtAdapter.DUCKDB,
                ),
            });
            await this.projectModel.saveExternalSourceExplore(
                projectUuid,
                explore,
            );
        }
        return this.externalSourceModel.getSource(projectUuid, sourceUuid);
    }

    /**
     * Replace a CSV source's file: the new raw upload is stored as the next
     * version and re-ingested by the worker. Charts referencing columns the
     * new file drops will fail validation.
     */
    async replaceCsv(
        account: RegisteredAccount,
        projectUuid: UUID,
        sourceUuid: UUID,
        input: ExternalSourceUploadInput,
    ): Promise<ExternalSource> {
        const { organizationUuid, userUuid } = await this.assertAccess(
            account,
            projectUuid,
        );
        this.assertEngineAvailable();

        const { source, tables } =
            await this.externalSourceModel.getSourceRowsForIngest(
                projectUuid,
                sourceUuid,
            );
        if (source.type !== ExternalSourceType.CSV) {
            throw new ParameterError(
                'Only CSV sources can have their file replaced',
            );
        }
        const table = tables[0];
        if (!table) {
            throw new NotFoundError('External source has no table');
        }
        if (source.status === ExternalSourceStatus.SYNCING) {
            throw new ParameterError(
                'This source is already ingesting. Wait for it to finish and try again',
            );
        }

        this.assertValidUpload(input);

        const rawKey = ExternalSourceService.rawKey(
            projectUuid,
            sourceUuid,
            table.version + 1,
        );
        await this.uploadRawFile(rawKey, input.body);

        // Reject unreadable files before committing to a re-ingest
        const client = this.createIngestClient();
        try {
            await this.describeCsv(client, this.toUri(rawKey));
        } catch (error) {
            throw new ParameterError(
                `Could not read the file as CSV: ${sanitizeDuckdbError(error)}`,
            );
        }

        await this.externalSourceModel.updateSource(sourceUuid, {
            status: ExternalSourceStatus.SYNCING,
            error_message: null,
            connection: {
                type: ExternalSourceType.CSV,
                originalFilename: input.filename,
            },
        });
        await this.enqueueIngest({
            organizationUuid,
            projectUuid,
            userUuid,
            sourceUuid,
            ingestVersion: table.version + 1,
        });
        return this.externalSourceModel.getSource(projectUuid, sourceUuid);
    }

    async getTablePreview(
        account: RegisteredAccount,
        projectUuid: UUID,
        sourceUuid: UUID,
        tableUuid: UUID,
    ): Promise<ExternalSourceTablePreview> {
        await this.assertAccess(account, projectUuid);
        const table = await this.externalSourceModel.findTableByUuid(
            projectUuid,
            tableUuid,
        );
        if (
            !table ||
            table.external_source_uuid !== sourceUuid ||
            !table.locator ||
            !table.columns
        ) {
            throw new NotFoundError(
                'The external source table has no ingested data yet',
            );
        }
        const client = this.createIngestClient();
        const escapedUri = ExternalSourceService.escapeUri(table.locator.uri);
        const { rows } = await client.runQuery(
            `SELECT * FROM read_parquet('${escapedUri}') LIMIT 25`,
            {},
        );
        return { columns: table.columns, sampleRows: rows };
    }

    async delete(
        account: RegisteredAccount,
        projectUuid: UUID,
        sourceUuid: UUID,
    ): Promise<void> {
        await this.assertAccess(account, projectUuid);
        const { source, tables } =
            await this.externalSourceModel.getSourceRowsForIngest(
                projectUuid,
                sourceUuid,
            );
        await this.projectModel.deleteExternalSourceExplores(
            projectUuid,
            tables.map((table) => table.name),
        );
        await this.externalSourceModel.deleteSource(
            projectUuid,
            source.external_source_uuid,
        );
    }

    async markIngestError(sourceUuid: UUID, error: unknown): Promise<void> {
        const rawMessage = getErrorMessage(error);
        const message = sanitizeDuckdbError(error).slice(
            0,
            ERROR_MESSAGE_MAX_LENGTH,
        );
        this.logger.error(
            `External source ingest failed for ${sourceUuid}: ${rawMessage}`,
        );
        await this.externalSourceModel.updateSource(sourceUuid, {
            status: ExternalSourceStatus.ERROR,
            error_message: message,
        });
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

            const buildVersion = payload.ingestVersion;
            if (table.version > buildVersion) {
                return;
            }
            if (table.version === buildVersion) {
                await this.externalSourceModel.updateSource(sourceUuid, {
                    status: ExternalSourceStatus.READY,
                    error_message: null,
                });
                return;
            }
            if (table.version !== buildVersion - 1) {
                throw new ParameterError(
                    `External source ingest version ${buildVersion} cannot follow version ${table.version}`,
                );
            }

            const client = this.createIngestClient();
            const rawFileKey = ExternalSourceService.rawKey(
                projectUuid,
                sourceUuid,
                buildVersion,
            );
            const rawUri = this.toUri(rawFileKey);

            // Sheets sources have no uploaded file: fetch the tab's values
            // under the connecting user's Google credentials and store them
            // as this version's raw CSV, then the shared pipeline takes over.
            if (
                source.type === ExternalSourceType.GOOGLE_SHEETS &&
                source.connection.type === ExternalSourceType.GOOGLE_SHEETS
            ) {
                if (!source.created_by_user_uuid) {
                    throw new ParameterError(
                        'The user who connected this sheet no longer exists. Reconnect the source',
                    );
                }
                const refreshToken = await this.getGoogleRefreshToken(
                    source.created_by_user_uuid,
                );
                const tabName =
                    source.connection.tabName ??
                    (
                        await this.googleDriveClient.listSheetTabs(
                            refreshToken,
                            source.connection.spreadsheetId,
                        )
                    )[0];
                const values = await this.googleDriveClient.getSheetValues(
                    refreshToken,
                    source.connection.spreadsheetId,
                    tabName,
                );
                if (values.length < 2) {
                    throw new ParameterError(
                        'The sheet needs a header row and at least one data row',
                    );
                }
                const csv = stringify(values);
                await this.uploadRawFile(rawFileKey, Readable.from([csv]));
            }

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

            await this.projectModel.saveExternalSourceExplore(
                projectUuid,
                explore,
            );

            const locator: PreAggregateDuckdbLocator =
                getPreAggregateDuckdbLocator({
                    uri: parquetUri,
                    format: 'parquet',
                });
            const didPublish = await this.externalSourceModel.updateTableIngest(
                table.external_source_table_uuid,
                {
                    columns,
                    locator,
                    rowCount,
                    totalBytes,
                    ingestVersion: buildVersion,
                },
            );
            if (!didPublish) {
                return;
            }
            await this.externalSourceModel.updateSource(sourceUuid, {
                status: ExternalSourceStatus.READY,
                error_message: null,
                last_refreshed_at: new Date(),
            });
        } catch (error) {
            await this.markIngestError(sourceUuid, error).catch(() => {});
            throw error;
        }
    }
}
