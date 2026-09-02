import { subject } from '@casl/ability';
import {
    AlreadyExistsError,
    createExternalSourceExplore,
    ExternalSourceScope,
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
    TimeoutError,
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
import { stringify } from 'csv-stringify';
import { once } from 'events';
import { PassThrough, Readable } from 'stream';
import { type GoogleDriveClient } from '../../../clients/Google/GoogleDriveClient';
import { type S3ResultsFileStorageClient } from '../../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import { type LightdashConfig } from '../../../config/parseConfig';
import { type DbExternalSourceIngestAttempt } from '../../../database/entities/externalSources';
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
const INGEST_CAPACITY_RETRY_MS = 5_000;
const ERROR_MESSAGE_MAX_LENGTH = 500;
const TABLE_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

export const shouldPublishExternalSourceExplore = (
    scope: ExternalSourceScope | null,
): boolean =>
    (scope ?? ExternalSourceScope.CATALOG) === ExternalSourceScope.CATALOG;

const externalSourceScope = (
    scope: ExternalSourceScope | null,
): ExternalSourceScope => scope ?? ExternalSourceScope.CATALOG;

export const getAttachmentTableName = (sourceUuid: UUID): string =>
    `attachment_${sourceUuid.replaceAll('-', '_')}`;

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
    schedulerClient: Pick<
        CommercialSchedulerClient,
        'ingestExternalSource' | 'ingestExternalSourceAttachment'
    >;
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
        executionUuid?: UUID,
    ): string {
        const executionSuffix = executionUuid ? `-${executionUuid}` : '';
        return `external-sources/${projectUuid}/${sourceUuid}/raw/v${version}${executionSuffix}.csv`;
    }

    private static parquetKey(
        projectUuid: UUID,
        sourceUuid: UUID,
        tableUuid: UUID,
        version: number,
        executionUuid: UUID,
    ): string {
        return `external-sources/${projectUuid}/${sourceUuid}/${tableUuid}/v${version}-${executionUuid}.parquet`;
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

    private async uploadTrackedObject(data: {
        organizationUuid: UUID;
        projectUuid: UUID;
        sourceUuid: UUID;
        attemptUuid?: UUID;
        key: string;
        purpose: 'raw' | 'parquet';
        body: Readable;
        expectedBytes?: number;
    }): Promise<number> {
        await this.externalSourceModel.registerObject({
            organizationUuid: data.organizationUuid,
            projectUuid: data.projectUuid,
            sourceUuid: data.sourceUuid,
            attemptUuid: data.attemptUuid,
            key: data.key,
            purpose: data.purpose,
            expectedBytes: data.expectedBytes,
            maxOrganizationBytes:
                this.lightdashConfig.externalSources.maxOrganizationBytes,
        });
        try {
            const bytes = await this.uploadRawFile(data.key, data.body);
            await this.externalSourceModel.completeObject(
                data.key,
                bytes,
                this.lightdashConfig.externalSources.maxOrganizationBytes,
            );
            return bytes;
        } catch (error) {
            await this.externalSourceModel
                .abandonObject(data.key, sanitizeDuckdbError(error))
                .catch(() => {});
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

    private async assertAttachmentFeaturesEnabled(user: {
        userUuid: UUID;
        organizationUuid: UUID;
    }): Promise<void> {
        const [multiSourceQuery, composeSqlRunner] = await Promise.all([
            this.featureFlagModel.get({
                user,
                featureFlagId: FeatureFlags.MultiSourceQuery,
            }),
            this.featureFlagModel.get({
                user,
                featureFlagId: FeatureFlags.ComposeSqlRunner,
            }),
        ]);
        if (!multiSourceQuery.enabled || !composeSqlRunner.enabled) {
            throw new ForbiddenError('AI data attachments are not enabled');
        }
    }

    private assertAttachmentOwner(
        account: RegisteredAccount,
        scope: ExternalSourceScope | null,
        createdByUserUuid: UUID | null,
    ): void {
        if (
            scope === ExternalSourceScope.ATTACHMENT &&
            createdByUserUuid !== account.user.id
        ) {
            throw new ForbiddenError('This attachment belongs to another user');
        }
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
        scope: ExternalSourceScope = ExternalSourceScope.CATALOG,
    ): Promise<StagedExternalSourceUpload> {
        const { organizationUuid, userUuid } = await this.assertAccess(
            account,
            projectUuid,
        );
        if (scope === ExternalSourceScope.ATTACHMENT) {
            await this.assertAttachmentFeaturesEnabled({
                organizationUuid,
                userUuid,
            });
        }
        this.assertEngineAvailable();
        this.assertValidUpload(input);

        const source = await this.externalSourceModel.createSource({
            projectUuid,
            type: ExternalSourceType.CSV,
            scope,
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
            await this.uploadTrackedObject({
                organizationUuid,
                projectUuid,
                sourceUuid: source.sourceUuid,
                key: rawKey,
                purpose: 'raw',
                body: input.body,
                expectedBytes: input.contentLength,
            });
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
        scope: ExternalSourceScope,
    ): Promise<void> {
        try {
            if (scope === ExternalSourceScope.ATTACHMENT) {
                await this.schedulerClient.ingestExternalSourceAttachment(
                    payload,
                );
            } else {
                await this.schedulerClient.ingestExternalSource(payload);
            }
        } catch (error) {
            // The durable queued attempt is recovered by maintain(); do not
            // turn a transient scheduler outage into a broken source.
            this.logger.warn(
                `External source attempt ${payload.attemptUuid} was persisted but not enqueued: ${getErrorMessage(error)}`,
            );
        }
    }

    private async requestIngest(data: {
        organizationUuid: UUID;
        projectUuid: UUID;
        userUuid: UUID;
        sourceUuid: UUID;
        scope: ExternalSourceScope;
        tableUuid: UUID;
        targetVersion: number;
        rawObjectKey?: string;
    }): Promise<void> {
        const attempt = await this.externalSourceModel.requestIngest({
            organizationUuid: data.organizationUuid,
            projectUuid: data.projectUuid,
            sourceUuid: data.sourceUuid,
            tableUuid: data.tableUuid,
            requestedByUserUuid: data.userUuid,
            targetVersion: data.targetVersion,
            rawObjectKey: data.rawObjectKey,
        });
        await this.enqueueIngest(
            {
                organizationUuid: data.organizationUuid,
                projectUuid: data.projectUuid,
                userUuid: data.userUuid,
                sourceUuid: data.sourceUuid,
                attemptUuid: attempt.external_source_ingest_attempt_uuid,
            },
            data.scope,
        );
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
            scope: ExternalSourceScope.CATALOG,
            name: tableName,
            status: ExternalSourceStatus.STAGED,
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
        await this.externalSourceModel.upsertGoogleCredential({
            sourceUuid: source.sourceUuid,
            refreshToken,
            connectedByUserUuid: userUuid,
        });
        await this.requestIngest({
            organizationUuid,
            projectUuid,
            userUuid,
            sourceUuid: source.sourceUuid,
            scope: externalSourceScope(source.scope),
            tableUuid: table.tableUuid,
            targetVersion: table.version + 1,
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
        this.assertAttachmentOwner(
            account,
            source.scope,
            source.createdByUserUuid,
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
        await this.requestIngest({
            organizationUuid,
            projectUuid,
            userUuid,
            sourceUuid,
            scope: externalSourceScope(source.scope),
            tableUuid: table.tableUuid,
            targetVersion: table.version + 1,
        });
        return this.externalSourceModel.getSource(projectUuid, sourceUuid);
    }

    /** Transfer the source to the current user's Google grant, then refresh. */
    async reconnectGoogleSheets(
        account: RegisteredAccount,
        projectUuid: UUID,
        sourceUuid: UUID,
    ): Promise<ExternalSource> {
        const { organizationUuid, userUuid } = await this.assertAccess(
            account,
            projectUuid,
        );
        const source = await this.externalSourceModel.getSource(
            projectUuid,
            sourceUuid,
        );
        this.assertAttachmentOwner(
            account,
            source.scope,
            source.createdByUserUuid,
        );
        if (
            source.type !== ExternalSourceType.GOOGLE_SHEETS ||
            source.connection.type !== ExternalSourceType.GOOGLE_SHEETS
        ) {
            throw new ParameterError('Only Google Sheets can be reconnected');
        }
        if (source.status === ExternalSourceStatus.SYNCING) {
            throw new ParameterError('This source is already ingesting');
        }
        const refreshToken = await this.getGoogleRefreshToken(userUuid);
        await this.googleDriveClient.assertFileIsGoogleSheet(
            refreshToken,
            source.connection.spreadsheetId,
        );
        await this.externalSourceModel.upsertGoogleCredential({
            sourceUuid,
            refreshToken,
            connectedByUserUuid: userUuid,
        });
        const table = source.tables[0];
        if (!table) throw new NotFoundError('External source has no table');
        await this.requestIngest({
            organizationUuid,
            projectUuid,
            userUuid,
            sourceUuid,
            scope: externalSourceScope(source.scope),
            tableUuid: table.tableUuid,
            targetVersion: table.version + 1,
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
        this.assertAttachmentOwner(
            account,
            source.scope,
            source.createdByUserUuid,
        );
        if (source.status !== ExternalSourceStatus.STAGED) {
            throw new ParameterError('This upload has already been committed');
        }

        const requestedTableName = payload.tableName?.trim();
        const filenameWithoutExtension =
            source.connection.type === ExternalSourceType.CSV
                ? source.connection.originalFilename.replace(/\.[^.]+$/, '')
                : 'upload';
        let tableName: string;
        if (!shouldPublishExternalSourceExplore(source.scope)) {
            tableName = getAttachmentTableName(sourceUuid);
        } else {
            if (!requestedTableName) {
                throw new ParameterError(
                    'Table name is required for catalog sources',
                );
            }
            tableName = await this.validateNewTableName(
                projectUuid,
                requestedTableName,
            );
        }
        const label =
            payload.label?.trim() ||
            friendlyName(
                shouldPublishExternalSourceExplore(source.scope)
                    ? tableName
                    : filenameWithoutExtension,
            );
        await this.externalSourceModel.updateSource(sourceUuid, {
            name: tableName,
            error_message: null,
        });
        const table = await this.externalSourceModel.createTable({
            sourceUuid,
            projectUuid,
            name: tableName,
            label,
        });

        await this.requestIngest({
            organizationUuid,
            projectUuid,
            userUuid,
            sourceUuid,
            scope: externalSourceScope(source.scope),
            tableUuid: table.tableUuid,
            targetVersion: table.version + 1,
            rawObjectKey: ExternalSourceService.rawKey(
                projectUuid,
                sourceUuid,
                table.version + 1,
            ),
        });

        return this.externalSourceModel.getSource(projectUuid, sourceUuid);
    }

    async list(
        account: RegisteredAccount,
        projectUuid: UUID,
    ): Promise<ExternalSource[]> {
        await this.assertAccess(account, projectUuid);
        const sources = await this.externalSourceModel.listSources(
            projectUuid,
            ExternalSourceScope.CATALOG,
        );
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
        const source = await this.externalSourceModel.getSource(
            projectUuid,
            sourceUuid,
        );
        this.assertAttachmentOwner(
            account,
            source.scope,
            source.createdByUserUuid,
        );
        return source;
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
        this.assertAttachmentOwner(
            account,
            source.scope,
            source.created_by_user_uuid,
        );
        const table = tables[0];
        if (!table) {
            throw new NotFoundError('External source has no table');
        }
        await this.externalSourceModel.updateTableLabel(
            table.external_source_table_uuid,
            label,
        );
        if (shouldPublishExternalSourceExplore(source.scope) && table.columns) {
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
        this.assertAttachmentOwner(
            account,
            source.scope,
            source.created_by_user_uuid,
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
        await this.uploadTrackedObject({
            organizationUuid,
            projectUuid,
            sourceUuid,
            key: rawKey,
            purpose: 'raw',
            body: input.body,
            expectedBytes: input.contentLength,
        });

        // Reject unreadable files before committing to a re-ingest
        const client = this.createIngestClient();
        try {
            await this.describeCsv(client, this.toUri(rawKey));
        } catch (error) {
            await this.externalSourceModel
                .abandonObject(rawKey, sanitizeDuckdbError(error))
                .catch(() => {});
            throw new ParameterError(
                `Could not read the file as CSV: ${sanitizeDuckdbError(error)}`,
            );
        }

        await this.externalSourceModel.updateSource(sourceUuid, {
            error_message: null,
            connection: {
                type: ExternalSourceType.CSV,
                originalFilename: input.filename,
            },
        });
        await this.requestIngest({
            organizationUuid,
            projectUuid,
            userUuid,
            sourceUuid,
            scope: externalSourceScope(source.scope),
            tableUuid: table.external_source_table_uuid,
            targetVersion: table.version + 1,
            rawObjectKey: rawKey,
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
        const source = await this.externalSourceModel.getSource(
            projectUuid,
            sourceUuid,
        );
        this.assertAttachmentOwner(
            account,
            source.scope,
            source.createdByUserUuid,
        );
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
        this.assertAttachmentOwner(
            account,
            source.scope,
            source.created_by_user_uuid,
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

    async markIngestError(attemptUuid: UUID, error: unknown): Promise<void> {
        const rawMessage = getErrorMessage(error);
        const message = sanitizeDuckdbError(error).slice(
            0,
            ERROR_MESSAGE_MAX_LENGTH,
        );
        this.logger.error(
            `External source ingest attempt ${attemptUuid} failed: ${rawMessage}`,
        );
        await this.externalSourceModel.failIngestAttempt(
            attemptUuid,
            message,
            error instanceof TimeoutError,
        );
    }

    private createSheetCsvStream(data: {
        refreshToken: string;
        spreadsheetId: string;
        tabName: string;
    }): { stream: Readable; completed: Promise<number> } {
        const output = new PassThrough();
        const csv = stringify();
        csv.pipe(output);
        const completed = (async () => {
            let rows = 0;
            try {
                // eslint-disable-next-line no-restricted-syntax
                for await (const batch of this.googleDriveClient.getSheetRowBatches(
                    data.refreshToken,
                    data.spreadsheetId,
                    data.tabName,
                    this.lightdashConfig.externalSources.googleSheetsBatchRows,
                )) {
                    // eslint-disable-next-line no-restricted-syntax
                    for (const row of batch) {
                        rows += 1;
                        if (
                            rows - 1 >
                            this.lightdashConfig.externalSources.maxRows
                        ) {
                            throw new ParameterError(
                                `Sheet exceeds the ${this.lightdashConfig.externalSources.maxRows} row limit`,
                            );
                        }
                        // csv-stringify is one ordered stream; parallel writes
                        // would corrupt row ordering.
                        // eslint-disable-next-line no-await-in-loop
                        if (!csv.write(row)) await once(csv, 'drain');
                    }
                }
                if (rows < 2) {
                    throw new ParameterError(
                        'The sheet needs a header row and at least one data row',
                    );
                }
                csv.end();
                return rows - 1;
            } catch (error) {
                csv.destroy(error as Error);
                output.destroy(error as Error);
                throw error;
            }
        })();
        return { stream: output, completed };
    }

    /**
     * Worker entry point: parse the raw file, write typed parquet, generate
     * the explore, and flip the source to ready. Any failure lands on the
     * source row as an error status.
     */
    async runIngest(payload: IngestExternalSourceJobPayload): Promise<void> {
        const claim = await this.externalSourceModel.claimIngestAttempt({
            attemptUuid: payload.attemptUuid,
            leaseMs: this.lightdashConfig.externalSources.ingestLeaseMs,
            maxConcurrentPerOrganization:
                this.lightdashConfig.externalSources
                    .maxConcurrentIngestsPerOrganization,
        });
        if (claim.state === 'capacity') {
            const options = {
                runAt: new Date(Date.now() + INGEST_CAPACITY_RETRY_MS),
            };
            if (claim.attachment) {
                await this.schedulerClient.ingestExternalSourceAttachment(
                    payload,
                    options,
                );
            } else {
                await this.schedulerClient.ingestExternalSource(
                    payload,
                    options,
                );
            }
            return;
        }
        if (claim.state === 'unavailable') return;
        const { attempt: claimed } = claim;
        const sourceUuid = claimed.external_source_uuid;
        const projectUuid = claimed.project_uuid;
        const executionUuid = claimed.execution_uuid;
        if (!executionUuid) throw new Error('Ingest lease has no execution id');
        let parquetKey: string | undefined;
        try {
            const { source, tables } =
                await this.externalSourceModel.getSourceRowsForIngest(
                    projectUuid,
                    sourceUuid,
                );
            const table = tables.find(
                (candidate) =>
                    candidate.external_source_table_uuid ===
                    claimed.external_source_table_uuid,
            );
            if (!table) {
                throw new NotFoundError(
                    'External source has no table to ingest',
                );
            }

            const buildVersion = claimed.target_version;
            if (table.version > buildVersion) {
                return;
            }
            if (table.version === buildVersion) {
                await this.externalSourceModel.publishIngestAttempt({
                    attemptUuid: payload.attemptUuid,
                    executionUuid,
                });
                return;
            }
            if (table.version !== buildVersion - 1) {
                throw new ParameterError(
                    `External source ingest version ${buildVersion} cannot follow version ${table.version}`,
                );
            }

            if (claimed.columns && claimed.locator) {
                if (!shouldPublishExternalSourceExplore(source.scope)) {
                    await this.externalSourceModel.publishIngestAttempt({
                        attemptUuid: payload.attemptUuid,
                        executionUuid,
                    });
                    return;
                }
                const explore = createExternalSourceExplore({
                    name: table.name,
                    label: table.label,
                    columns: claimed.columns,
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
                await this.externalSourceModel.publishIngestAttempt({
                    attemptUuid: payload.attemptUuid,
                    executionUuid,
                });
                return;
            }

            const client = this.createIngestClient();
            const rawFileKey = ExternalSourceService.rawKey(
                projectUuid,
                sourceUuid,
                buildVersion,
                source.type === ExternalSourceType.GOOGLE_SHEETS
                    ? executionUuid
                    : undefined,
            );
            const rawUri = this.toUri(rawFileKey);

            // Sheets sources have no uploaded file: fetch the tab's values
            // under the source-owned Google credential and store them
            // as this version's raw CSV, then the shared pipeline takes over.
            if (
                source.type === ExternalSourceType.GOOGLE_SHEETS &&
                source.connection.type === ExternalSourceType.GOOGLE_SHEETS
            ) {
                const refreshToken =
                    await this.externalSourceModel.getGoogleCredential(
                        sourceUuid,
                    );
                const tabName =
                    source.connection.tabName ??
                    (
                        await this.googleDriveClient.listSheetTabs(
                            refreshToken,
                            source.connection.spreadsheetId,
                        )
                    )[0];
                const sheetCsv = this.createSheetCsvStream({
                    refreshToken,
                    spreadsheetId: source.connection.spreadsheetId,
                    tabName,
                });
                await Promise.all([
                    this.uploadTrackedObject({
                        organizationUuid: claimed.organization_uuid,
                        projectUuid,
                        sourceUuid,
                        attemptUuid: payload.attemptUuid,
                        key: rawFileKey,
                        purpose: 'raw',
                        body: sheetCsv.stream,
                    }),
                    sheetCsv.completed,
                ]);
            }

            parquetKey = ExternalSourceService.parquetKey(
                projectUuid,
                sourceUuid,
                table.external_source_table_uuid,
                buildVersion,
                executionUuid,
            );
            const parquetUri = this.toUri(parquetKey);
            const escapedRawUri = ExternalSourceService.escapeUri(rawUri);
            const escapedParquetUri =
                ExternalSourceService.escapeUri(parquetUri);

            await this.externalSourceModel.registerObject({
                organizationUuid: claimed.organization_uuid,
                projectUuid,
                sourceUuid,
                attemptUuid: payload.attemptUuid,
                key: parquetKey,
                purpose: 'parquet',
                maxOrganizationBytes:
                    this.lightdashConfig.externalSources.maxOrganizationBytes,
            });
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
            if (rowCount > this.lightdashConfig.externalSources.maxRows) {
                throw new ParameterError(
                    `Source exceeds the ${this.lightdashConfig.externalSources.maxRows} row limit`,
                );
            }
            const totalBytes = await this.storageClient.getFileSize(
                parquetKey,
                'parquet',
            );
            if (totalBytes === null) {
                throw new Error('Could not determine ingested object size');
            }
            await this.externalSourceModel.completeObject(
                parquetKey,
                totalBytes,
                this.lightdashConfig.externalSources.maxOrganizationBytes,
            );

            const locator: PreAggregateDuckdbLocator =
                getPreAggregateDuckdbLocator({
                    uri: parquetUri,
                    format: 'parquet',
                });
            const recorded = await this.externalSourceModel.recordIngestOutput({
                attemptUuid: payload.attemptUuid,
                executionUuid,
                columns,
                locator,
                rowCount,
                totalBytes,
            });
            if (!recorded) return;
            if (shouldPublishExternalSourceExplore(source.scope)) {
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
            }
            await this.externalSourceModel.publishIngestAttempt({
                attemptUuid: payload.attemptUuid,
                executionUuid,
            });
        } catch (error) {
            if (parquetKey) {
                await this.externalSourceModel
                    .abandonObject(parquetKey, sanitizeDuckdbError(error))
                    .catch(() => {});
            }
            await this.markIngestError(payload.attemptUuid, error).catch(
                () => {},
            );
            throw error;
        }
    }

    /** Recover durable jobs and collect manifest-backed objects. */
    async maintain(): Promise<void> {
        const recoverable =
            await this.externalSourceModel.listRecoverableAttempts(
                this.lightdashConfig.externalSources.garbageCollectionBatchSize,
            );
        await Promise.allSettled(
            recoverable.map(async (attempt) => {
                const source = await this.externalSourceModel.getSource(
                    attempt.project_uuid,
                    attempt.external_source_uuid,
                );
                await this.enqueueIngest(
                    {
                        organizationUuid: attempt.organization_uuid,
                        projectUuid: attempt.project_uuid,
                        userUuid: attempt.requested_by_user_uuid ?? 'system',
                        sourceUuid: attempt.external_source_uuid,
                        attemptUuid:
                            attempt.external_source_ingest_attempt_uuid,
                    },
                    externalSourceScope(source.scope),
                );
            }),
        );

        const now = Date.now();
        const expiredAttachments =
            await this.externalSourceModel.listExpiredUnreferencedAttachments(
                new Date(
                    now -
                        this.lightdashConfig.externalSources
                            .stagedUploadTtlHours *
                            60 *
                            60 *
                            1000,
                ),
                this.lightdashConfig.externalSources.garbageCollectionBatchSize,
            );
        await Promise.allSettled(
            expiredAttachments.map((source) =>
                this.externalSourceModel.deleteSource(
                    source.project_uuid,
                    source.external_source_uuid,
                ),
            ),
        );

        const objects = await this.externalSourceModel.prepareGarbageCollection(
            {
                stagedBefore: new Date(
                    now -
                        this.lightdashConfig.externalSources
                            .stagedUploadTtlHours *
                            60 *
                            60 *
                            1000,
                ),
                uploadingBefore: new Date(
                    now -
                        Math.max(
                            this.lightdashConfig.externalSources.ingestLeaseMs *
                                2,
                            2 * 60 * 60 * 1000,
                        ),
                ),
                limit: this.lightdashConfig.externalSources
                    .garbageCollectionBatchSize,
            },
        );
        await Promise.all(
            objects.map(async (object) => {
                try {
                    await this.storageClient.deleteFile(object.object_key);
                    await this.externalSourceModel.markObjectDeleted(
                        object.external_source_object_uuid,
                    );
                } catch (error) {
                    await this.externalSourceModel.markObjectDeleteFailed(
                        object.external_source_object_uuid,
                        sanitizeDuckdbError(error).slice(
                            0,
                            ERROR_MESSAGE_MAX_LENGTH,
                        ),
                    );
                }
            }),
        );
    }
}
