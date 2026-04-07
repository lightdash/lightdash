import {
    getErrorMessage,
    NotFoundError,
    PRE_AGGREGATE_ROW_COUNT_WARNING_THRESHOLD,
    QueryExecutionContext,
    QueryHistoryStatus,
    type Account,
    type ActiveMaterializationDetails,
    type ApiPreAggregateMaterializationsResults,
    type KnexPaginateArgs,
    type KnexPaginatedData,
    type PreAggregateMaterializationTrigger,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { type S3ResultsFileStorageClient } from '../../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import { type LightdashConfig } from '../../../config/parseConfig';
import { type QueryHistoryModel } from '../../../models/QueryHistoryModel/QueryHistoryModel';
import type PrometheusMetrics from '../../../prometheus/PrometheusMetrics';
import { type AsyncQueryService } from '../../../services/AsyncQueryService/AsyncQueryService';
import { BaseService } from '../../../services/BaseService';
import { PreAggregateModel } from '../../models/PreAggregateModel';

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
                        internalExecutionOptions: {
                            allowMaterializationContext: true,
                        },
                        metricQuery: {
                            ...materializationMetricQuery.metricQuery,
                            sorts: materializationMetricQuery.metricQuery.dimensions
                                .slice()
                                .sort((a, b) => {
                                    const timeDim =
                                        materializationMetricQuery.timeDimensionFieldId;
                                    if (a === timeDim) return -1;
                                    if (b === timeDim) return 1;
                                    return 0;
                                })
                                .map((fieldId) => ({
                                    fieldId,
                                    descending:
                                        fieldId ===
                                        materializationMetricQuery.timeDimensionFieldId,
                                })),
                        },
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

            const pollStart = Date.now();
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
            const pollDurationMs = Date.now() - pollStart;

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
                    durationMs / 1000,
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

            const columnCount = queryHistory.columns
                ? Object.keys(queryHistory.columns).length
                : null;

            // Get file size from S3 and promote to active — timed together
            const promoteStart = Date.now();
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
            const promoteDurationMs = Date.now() - promoteStart;

            if (
                queryHistory.totalRowCount != null &&
                queryHistory.totalRowCount >
                    PRE_AGGREGATE_ROW_COUNT_WARNING_THRESHOLD
            ) {
                this.logger.warn(
                    `Pre-aggregate materialization has ${queryHistory.totalRowCount} rows, exceeding threshold of ${PRE_AGGREGATE_ROW_COUNT_WARNING_THRESHOLD}`,
                    {
                        materializationUuid,
                        queryUuid,
                        projectUuid: args.projectUuid,
                        preAggregateDefinitionUuid:
                            args.preAggregateDefinitionUuid,
                        rowCount: queryHistory.totalRowCount,
                        threshold: PRE_AGGREGATE_ROW_COUNT_WARNING_THRESHOLD,
                    },
                );
            }

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
                durationMs / 1000,
            );

            // Sub-step metrics
            this.prometheusMetrics?.observeMaterializationPollDuration(
                pollDurationMs,
                status,
                args.trigger,
            );
            if (queryHistory.warehouseExecutionTimeMs != null) {
                this.prometheusMetrics?.observeMaterializationWarehouseDuration(
                    queryHistory.warehouseExecutionTimeMs,
                    status,
                    args.trigger,
                );
            }
            this.prometheusMetrics?.observeMaterializationPromoteDuration(
                promoteDurationMs,
                status,
                args.trigger,
            );
            if (totalBytes != null) {
                this.prometheusMetrics?.observeMaterializationFileSize(
                    totalBytes,
                    this.getMaterializationFormat(),
                );
            }

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
