import {
    getErrorMessage,
    NotFoundError,
    QueryExecutionContext,
    QueryHistoryStatus,
    type Account,
    type ActiveMaterializationDetails,
    type ApiPreAggregateMaterializationsResults,
    type KnexPaginateArgs,
    type KnexPaginatedData,
    type PreAggregateMaterializationTrigger,
    type ResultColumns,
} from '@lightdash/common';
import { DuckdbWarehouseClient } from '@lightdash/warehouses';
import * as Sentry from '@sentry/node';
import { type S3ResultsFileStorageClient } from '../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import { type LightdashConfig } from '../../config/parseConfig';
import { PreAggregateModel } from '../../models/PreAggregateModel';
import { type QueryHistoryModel } from '../../models/QueryHistoryModel/QueryHistoryModel';
import type PrometheusMetrics from '../../prometheus/PrometheusMetrics';
import { type AsyncQueryService } from '../AsyncQueryService/AsyncQueryService';
import { getDuckdbRuntimeConfig } from '../AsyncQueryService/getDuckdbRuntimeConfig';
import { BaseService } from '../BaseService';
import {
    getDuckdbPreAggregateSqlTable,
    getPreAggregateDuckdbLocator,
    quoteDuckdbIdentifier,
} from './getDuckdbPreAggregateSqlTable';

const QUERY_POLL_INTERVAL_MS = 1000;
const QUERY_POLL_TIMEOUT_MS = 30 * 60 * 1000;

export class PreAggregateMaterializationService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly preAggregateModel: PreAggregateModel;

    private readonly queryHistoryModel: QueryHistoryModel;

    private readonly asyncQueryService: AsyncQueryService;

    private readonly prometheusMetrics: PrometheusMetrics | undefined;

    private readonly preAggregateResultsStorageClient: S3ResultsFileStorageClient;

    constructor(args: {
        lightdashConfig: LightdashConfig;
        preAggregateModel: PreAggregateModel;
        queryHistoryModel: QueryHistoryModel;
        asyncQueryService: AsyncQueryService;
        preAggregateResultsStorageClient: S3ResultsFileStorageClient;
        prometheusMetrics?: PrometheusMetrics;
    }) {
        super({ serviceName: 'PreAggregateMaterializationService' });
        this.lightdashConfig = args.lightdashConfig;
        this.preAggregateModel = args.preAggregateModel;
        this.queryHistoryModel = args.queryHistoryModel;
        this.asyncQueryService = args.asyncQueryService;
        this.preAggregateResultsStorageClient =
            args.preAggregateResultsStorageClient;
        this.prometheusMetrics = args.prometheusMetrics;
    }

    private get parquetEnabled(): boolean {
        return this.lightdashConfig.preAggregates.parquetEnabled;
    }

    private getJsonlUri(resultsFileName: string): string {
        const bucket = this.lightdashConfig.preAggregates.s3?.bucket;

        if (!bucket) {
            throw new Error(
                'Missing pre-aggregate S3 bucket configuration for materializations',
            );
        }

        return `s3://${bucket}/${resultsFileName}.jsonl`;
    }

    private getMaterializationUri(resultsFileName: string): string {
        const bucket = this.lightdashConfig.preAggregates.s3?.bucket;

        if (!bucket) {
            throw new Error(
                'Missing pre-aggregate S3 bucket configuration for materializations',
            );
        }

        const extension = this.parquetEnabled ? 'parquet' : 'jsonl';
        return `s3://${bucket}/${resultsFileName}.${extension}`;
    }

    private getMaterializationFormat(): 'jsonl' | 'parquet' {
        return this.parquetEnabled ? 'parquet' : 'jsonl';
    }

    private async convertJsonlToParquet(
        jsonlUri: string,
        parquetUri: string,
        columns: ResultColumns | null,
        dimensionFieldIds: string[],
    ): Promise<void> {
        const s3Config = getDuckdbRuntimeConfig(
            this.lightdashConfig.preAggregates.s3,
        );

        if (!s3Config) {
            throw new Error(
                'Missing DuckDB runtime S3 configuration for Parquet conversion',
            );
        }

        const duckdb = new DuckdbWarehouseClient({
            s3Config,
            resourceLimits: { memoryLimit: '256MB', threads: 1 },
            logger: this.logger,
        });

        const jsonlSqlTable = getDuckdbPreAggregateSqlTable(
            getPreAggregateDuckdbLocator({ uri: jsonlUri, format: 'jsonl' }),
            columns,
        );

        const orderByClause =
            dimensionFieldIds.length > 0
                ? ` ORDER BY ${dimensionFieldIds.map(quoteDuckdbIdentifier).join(', ')}`
                : '';

        const copySql = `COPY (SELECT * FROM ${jsonlSqlTable}${orderByClause}) TO '${parquetUri}' (FORMAT PARQUET, COMPRESSION zstd, ROW_GROUP_SIZE 100000)`;
        const metrics = await duckdb.runSqlWithMetrics(copySql);

        this.logger.info(
            `DuckDB JSONL→Parquet conversion metrics: bootstrap=${metrics.bootstrapMs}ms, query=${metrics.queryMs}ms, total=${metrics.totalMs}ms`,
        );

        Sentry.getActiveSpan()?.setAttributes({
            'duckdb.bootstrapMs': metrics.bootstrapMs,
            'duckdb.queryMs': metrics.queryMs,
            'duckdb.totalMs': metrics.totalMs,
        });
    }

    private async recordFileSizes(resultsFileName: string): Promise<void> {
        const [jsonlSize, parquetSize] = await Promise.all([
            this.preAggregateResultsStorageClient.getFileSize(
                resultsFileName,
                'jsonl',
            ),
            this.preAggregateResultsStorageClient.getFileSize(
                resultsFileName,
                'parquet',
            ),
        ]);

        if (jsonlSize != null) {
            this.prometheusMetrics?.preAggregateMaterializationFileSizeGauge?.set(
                { format: 'jsonl' },
                jsonlSize,
            );
        }

        if (parquetSize != null) {
            this.prometheusMetrics?.preAggregateMaterializationFileSizeGauge?.set(
                { format: 'parquet' },
                parquetSize,
            );
        }

        this.logger.info(
            `Pre-aggregate file sizes - JSONL: ${jsonlSize ?? 'unknown'} bytes, Parquet: ${parquetSize ?? 'unknown'} bytes`,
        );
    }

    async materializePreAggregate(args: {
        account: Account;
        projectUuid: string;
        preAggregateDefinitionUuid: string;
        trigger: PreAggregateMaterializationTrigger;
    }): Promise<{
        materializationUuid: string;
        status: 'active' | 'superseded' | 'failed';
        queryUuid?: string;
    }> {
        let materializationUuid: string | undefined;
        const startTime = Date.now();

        try {
            const definition =
                await this.preAggregateModel.getPreAggregateDefinitionByUuid({
                    projectUuid: args.projectUuid,
                    preAggregateDefinitionUuid: args.preAggregateDefinitionUuid,
                });

            if (!definition) {
                throw new NotFoundError(
                    `Pre-aggregate definition "${args.preAggregateDefinitionUuid}" was not found`,
                );
            }

            this.logger.info(
                `Starting pre-aggregate materialization for definition ${args.preAggregateDefinitionUuid}`,
                {
                    projectUuid: args.projectUuid,
                    preAggregateDefinitionUuid: args.preAggregateDefinitionUuid,
                    trigger: args.trigger,
                },
            );

            const materializationRow =
                await this.preAggregateModel.insertInProgress({
                    projectUuid: args.projectUuid,
                    preAggregateDefinitionUuid:
                        definition.preAggregateDefinitionUuid,
                    trigger: args.trigger,
                });
            materializationUuid = materializationRow.materializationUuid;

            const { materializationMetricQuery } = definition;
            if (!materializationMetricQuery) {
                await this.preAggregateModel.markFailed({
                    materializationUuid,
                    errorMessage:
                        definition.materializationQueryError ||
                        'Pre-aggregate definition is missing materialization query',
                });

                return {
                    materializationUuid,
                    status: 'failed',
                };
            }

            this.logger.info(
                `Starting executeAsyncMetricQuery for pre-aggregate materialization for definition ${args.preAggregateDefinitionUuid}`,
            );

            const { queryUuid } = await Sentry.startSpan(
                {
                    op: 'preaggregate',
                    name: 'executeAsyncMetricQuery',
                    attributes: {
                        projectUuid: args.projectUuid,
                        materializationUuid,
                    },
                },
                () =>
                    this.asyncQueryService.executeAsyncMetricQuery({
                        account: args.account,
                        projectUuid: args.projectUuid,
                        context:
                            QueryExecutionContext.PRE_AGGREGATE_MATERIALIZATION,
                        metricQuery: materializationMetricQuery.metricQuery,
                        invalidateCache: true,
                    }),
            );

            this.logger.info(
                `executeAsyncMetricQuery completed for pre-aggregate materialization for definition ${args.preAggregateDefinitionUuid}`,
                {
                    materializationUuid,
                    queryUuid,
                },
            );

            await this.preAggregateModel.attachQueryUuid({
                materializationUuid,
                queryUuid,
            });

            this.logger.info(
                `Starting pollForQueryCompletion for pre-aggregate materialization for definition ${args.preAggregateDefinitionUuid}`,
                {
                    materializationUuid,
                    queryUuid,
                },
            );

            const queryHistory = await Sentry.startSpan(
                {
                    op: 'preaggregate',
                    name: 'pollForQueryCompletion',
                    attributes: {
                        queryUuid,
                        projectUuid: args.projectUuid,
                        materializationUuid,
                    },
                },
                () =>
                    this.queryHistoryModel.pollForQueryCompletion({
                        queryUuid,
                        account: args.account,
                        projectUuid: args.projectUuid,
                        initialBackoffMs: QUERY_POLL_INTERVAL_MS,
                        maxBackoffMs: QUERY_POLL_INTERVAL_MS,
                        timeoutMs: QUERY_POLL_TIMEOUT_MS,
                        throwOnCancelled: false,
                        throwOnError: false,
                    }),
            );

            this.logger.info(
                `pollForQueryCompletion completed for pre-aggregate materialization for definition ${args.preAggregateDefinitionUuid}`,
                {
                    materializationUuid,
                    queryUuid,
                    queryStatus: queryHistory.status,
                },
            );

            if (queryHistory.status !== QueryHistoryStatus.READY) {
                const errorMessage =
                    queryHistory.error ||
                    `Materialization query ${queryUuid} did not complete successfully`;

                this.logger.warn(`Pre-aggregate materialization query failed`, {
                    materializationUuid,
                    queryUuid,
                    projectUuid: args.projectUuid,
                    preAggregateDefinitionUuid: args.preAggregateDefinitionUuid,
                    trigger: args.trigger,
                    queryStatus: queryHistory.status,
                    errorMessage,
                });

                await this.preAggregateModel.markFailed({
                    materializationUuid,
                    errorMessage,
                });

                const durationMs = Date.now() - startTime;
                this.prometheusMetrics?.preAggregateMaterializationCounter?.inc(
                    { status: 'failed', trigger: args.trigger },
                );
                this.prometheusMetrics?.preAggregateMaterializationDurationHistogram?.observe(
                    { status: 'failed', trigger: args.trigger },
                    durationMs,
                );

                return {
                    materializationUuid,
                    status: 'failed',
                    queryUuid,
                };
            }

            if (!queryHistory.resultsFileName) {
                this.logger.warn(
                    `Pre-aggregate materialization completed without results file`,
                    {
                        materializationUuid,
                        queryUuid,
                        projectUuid: args.projectUuid,
                        preAggregateDefinitionUuid:
                            args.preAggregateDefinitionUuid,
                    },
                );

                await this.preAggregateModel.markFailed({
                    materializationUuid,
                    errorMessage:
                        'Materialization query completed without a persisted results file',
                });

                return {
                    materializationUuid,
                    status: 'failed',
                    queryUuid,
                };
            }

            // Convert JSONL to Parquet if enabled
            if (this.parquetEnabled) {
                const jsonlUri = this.getJsonlUri(queryHistory.resultsFileName);
                const parquetUri = this.getMaterializationUri(
                    queryHistory.resultsFileName,
                );

                this.logger.info(
                    `Starting conversion of JSONL to Parquet for pre-aggregate materialization for definition ${args.preAggregateDefinitionUuid}`,
                    {
                        materializationUuid,
                        queryUuid,
                        jsonlUri,
                        parquetUri,
                    },
                );

                const conversionStartTime = Date.now();
                try {
                    await Sentry.startSpan(
                        {
                            op: 'preaggregate',
                            name: 'convertJsonlToParquet',
                            attributes: {
                                projectUuid: args.projectUuid,
                                materializationUuid,
                                queryUuid,
                                rowCount: queryHistory.totalRowCount ?? 0,
                            },
                        },
                        () =>
                            this.convertJsonlToParquet(
                                jsonlUri,
                                parquetUri,
                                queryHistory.columns,
                                materializationMetricQuery.metricQuery
                                    .dimensions,
                            ),
                    );

                    this.logger.info(
                        `Conversion of JSONL to Parquet completed for pre-aggregate materialization for definition ${args.preAggregateDefinitionUuid}`,
                        {
                            materializationUuid,
                            queryUuid,
                        },
                    );

                    const conversionDurationMs =
                        Date.now() - conversionStartTime;
                    this.prometheusMetrics?.preAggregateParquetConversionDurationHistogram?.observe(
                        { status: 'success' },
                        conversionDurationMs,
                    );

                    this.logger.info(
                        `Converted pre-aggregate JSONL to Parquet in ${conversionDurationMs}ms`,
                    );
                } catch (error) {
                    const conversionDurationMs =
                        Date.now() - conversionStartTime;
                    this.prometheusMetrics?.preAggregateParquetConversionDurationHistogram?.observe(
                        { status: 'failed' },
                        conversionDurationMs,
                    );

                    throw new Error(
                        `Failed to convert JSONL to Parquet: ${getErrorMessage(error)}`,
                    );
                }

                // Record file sizes for both formats (keeping JSONL for comparison)
                await Sentry.startSpan(
                    {
                        op: 'preaggregate',
                        name: 'recordFileSizes',
                        attributes: {
                            materializationUuid,
                        },
                    },
                    () =>
                        this.recordFileSizes(
                            queryHistory.resultsFileName!,
                        ).catch((e) =>
                            this.logger.warn(
                                `Failed to record file sizes: ${getErrorMessage(e)}`,
                            ),
                        ),
                );
            }

            const columnCount = queryHistory.columns
                ? Object.keys(queryHistory.columns).length
                : null;

            // Get file size from S3 for the active format
            const totalBytes = await Sentry.startSpan(
                {
                    op: 'preaggregate',
                    name: 'getFileSize',
                    attributes: {
                        materializationUuid,
                        format: this.getMaterializationFormat(),
                    },
                },
                () =>
                    this.preAggregateResultsStorageClient.getFileSize(
                        queryHistory.resultsFileName!,
                        this.parquetEnabled ? 'parquet' : 'jsonl',
                    ),
            );

            this.logger.info(`Pre-aggregate materialization query completed`, {
                materializationUuid,
                queryUuid,
                projectUuid: args.projectUuid,
                preAggregateDefinitionUuid: args.preAggregateDefinitionUuid,
                trigger: args.trigger,
                format: this.getMaterializationFormat(),
                rowCount: queryHistory.totalRowCount,
                columnCount,
                totalBytes,
                resultsFileName: queryHistory.resultsFileName,
                warehouseExecutionTimeMs: queryHistory.warehouseExecutionTimeMs,
            });

            const { status } = await Sentry.startSpan(
                {
                    op: 'db',
                    name: 'promoteToActive',
                    attributes: {
                        materializationUuid,
                        queryUuid,
                        rowCount: queryHistory.totalRowCount ?? 0,
                        totalBytes: totalBytes ?? 0,
                        format: this.getMaterializationFormat(),
                    },
                },
                () =>
                    this.preAggregateModel.promoteToActive({
                        materializationUuid: materializationUuid!,
                        queryUuid,
                        materializationUri: this.getMaterializationUri(
                            queryHistory.resultsFileName!,
                        ),
                        materializedAt:
                            queryHistory.resultsUpdatedAt || new Date(),
                        rowCount: queryHistory.totalRowCount,
                        columns: queryHistory.columns,
                        totalBytes,
                    }),
            );

            const durationMs = Date.now() - startTime;
            this.logger.info(`Pre-aggregate materialization ${status}`, {
                materializationUuid,
                queryUuid,
                projectUuid: args.projectUuid,
                preAggregateDefinitionUuid: args.preAggregateDefinitionUuid,
                trigger: args.trigger,
                status,
                format: this.getMaterializationFormat(),
                rowCount: queryHistory.totalRowCount,
                columnCount,
                totalBytes,
                totalDurationMs: durationMs,
                warehouseExecutionTimeMs: queryHistory.warehouseExecutionTimeMs,
            });

            this.prometheusMetrics?.preAggregateMaterializationCounter?.inc({
                status,
                trigger: args.trigger,
            });
            this.prometheusMetrics?.preAggregateMaterializationDurationHistogram?.observe(
                { status, trigger: args.trigger },
                durationMs,
            );

            return {
                materializationUuid,
                status,
                queryUuid,
            };
        } catch (error) {
            const durationMs = Date.now() - startTime;

            this.logger.error(`Pre-aggregate materialization error`, {
                materializationUuid,
                projectUuid: args.projectUuid,
                preAggregateDefinitionUuid: args.preAggregateDefinitionUuid,
                trigger: args.trigger,
                totalDurationMs: durationMs,
                error:
                    error instanceof Error
                        ? error.message
                        : 'Unknown materialization error',
            });

            this.prometheusMetrics?.preAggregateMaterializationCounter?.inc({
                status: 'failed',
                trigger: args.trigger,
            });
            this.prometheusMetrics?.preAggregateMaterializationDurationHistogram?.observe(
                { status: 'failed', trigger: args.trigger },
                durationMs,
            );

            if (materializationUuid) {
                await this.preAggregateModel.markFailed({
                    materializationUuid,
                    errorMessage:
                        error instanceof Error
                            ? error.message
                            : 'Unknown materialization error',
                });

                return {
                    materializationUuid,
                    status: 'failed',
                };
            }

            throw error;
        }
    }

    async getMaterializations(
        projectUuid: string,
        paginateArgs?: KnexPaginateArgs,
    ): Promise<KnexPaginatedData<ApiPreAggregateMaterializationsResults>> {
        return this.preAggregateModel.getDefinitionsWithLatestMaterialization(
            projectUuid,
            paginateArgs,
        );
    }

    async getActiveMaterialization(
        projectUuid: string,
        preAggExploreName: string,
    ): Promise<
        | {
              queryUuid: string;
              materializationUri: string;
              format: 'jsonl' | 'parquet';
              columns: ActiveMaterializationDetails['columns'];
              materializedAt: Date;
          }
        | undefined
    > {
        const activeMaterialization =
            await this.preAggregateModel.getActiveMaterialization(
                projectUuid,
                preAggExploreName,
            );

        if (!activeMaterialization) {
            return undefined;
        }

        return {
            queryUuid: activeMaterialization.queryUuid,
            materializationUri: activeMaterialization.materializationUri,
            format: activeMaterialization.format,
            columns: activeMaterialization.columns,
            materializedAt: activeMaterialization.materializedAt,
        };
    }
}
