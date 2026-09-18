import {
    DimensionType,
    getErrorMessage,
    getPreAggregateExploreName,
    NotFoundError,
    ParameterError,
    PRE_AGGREGATE_ROW_COUNT_WARNING_THRESHOLD,
    QueryHistoryStatus,
    type Account,
    type ActiveMaterializationDetails,
    type ApiPreAggregateMaterializationsResults,
    type KnexPaginateArgs,
    type KnexPaginatedData,
    type PreAggregateMaterializationTrigger,
    type ResultColumns,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import { type S3ResultsFileStorageClient } from '../../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import { type LightdashConfig } from '../../../config/parseConfig';
import { type QueryHistoryModel } from '../../../models/QueryHistoryModel/QueryHistoryModel';
import type PrometheusMetrics from '../../../prometheus/PrometheusMetrics';
import { type AsyncQueryService } from '../../../services/AsyncQueryService/AsyncQueryService';
import { BaseService } from '../../../services/BaseService';
import { traceSpan } from '../../../tracing/tracing';
import {
    ObsoletePreAggregateScheduleError,
    PreAggregateModel,
} from '../../models/PreAggregateModel';

type SkipReason = 'unchanged_active' | 'obsolete_schedule' | 'ineligible';
type MaterializationResult =
    | { status: 'skipped'; reason: SkipReason }
    | {
          materializationUuid: string;
          status: 'active' | 'superseded' | 'failed';
          queryUuid?: string;
      };

const QUERY_POLL_INTERVAL_MS = 1000;
const QUERY_POLL_TIMEOUT_MS = 30 * 60 * 1000;

export class PreAggregateMaterializationService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly preAggregateModel: PreAggregateModel;

    private readonly queryHistoryModel: Pick<
        QueryHistoryModel,
        'pollForQueryCompletion'
    >;

    private readonly asyncQueryService: Pick<
        AsyncQueryService,
        'prepareRegisteredPreAggregate' | 'executePreAggregateMaterialization'
    >;

    private readonly analytics: Pick<LightdashAnalytics, 'trackAccount'>;

    private readonly prometheusMetrics: PrometheusMetrics | undefined;

    private readonly preAggregateResultsStorageClient: Pick<
        S3ResultsFileStorageClient,
        'getFileSize'
    >;

    constructor(args: {
        lightdashConfig: LightdashConfig;
        preAggregateModel: PreAggregateModel;
        queryHistoryModel: Pick<QueryHistoryModel, 'pollForQueryCompletion'>;
        asyncQueryService: Pick<
            AsyncQueryService,
            | 'prepareRegisteredPreAggregate'
            | 'executePreAggregateMaterialization'
        >;
        analytics: Pick<LightdashAnalytics, 'trackAccount'>;
        preAggregateResultsStorageClient: Pick<
            S3ResultsFileStorageClient,
            'getFileSize'
        >;
        prometheusMetrics?: PrometheusMetrics;
    }) {
        super({ serviceName: 'PreAggregateMaterializationService' });
        this.lightdashConfig = args.lightdashConfig;
        this.preAggregateModel = args.preAggregateModel;
        this.queryHistoryModel = args.queryHistoryModel;
        this.asyncQueryService = args.asyncQueryService;
        this.analytics = args.analytics;
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

    private trackMaterializationCompleted(args: {
        account: Account;
        materializationUuid: string;
        queryUuid: string;
        projectUuid: string;
        preAggregateDefinitionUuid: string;
        preAggregateName?: string;
        trigger: PreAggregateMaterializationTrigger;
        status: 'active' | 'superseded';
        format: 'jsonl' | 'parquet';
        rowCount: number | null | undefined;
        columnCount: number | null;
        totalBytes: number | null | undefined;
        warehouseExecutionTimeMs: number | null | undefined;
        totalDurationMs: number;
    }): void {
        this.analytics.trackAccount(args.account, {
            event: 'materialization.completed',
            properties: {
                organizationId: args.account.organization?.organizationUuid,
                materializationUuid: args.materializationUuid,
                queryId: args.queryUuid,
                projectId: args.projectUuid,
                preAggregateDefinitionUuid: args.preAggregateDefinitionUuid,
                preAggregateName: args.preAggregateName,
                trigger: args.trigger,
                materializationStatus: args.status,
                format: args.format,
                rowCount: args.rowCount,
                columnCount: args.columnCount,
                totalBytes: args.totalBytes,
                warehouseExecutionTimeMs: args.warehouseExecutionTimeMs,
                totalDurationMs: args.totalDurationMs,
            },
        });
    }

    private trackMaterializationFailed(args: {
        account: Account;
        materializationUuid: string;
        projectUuid: string;
        preAggregateDefinitionUuid: string;
        preAggregateName?: string;
        trigger: PreAggregateMaterializationTrigger;
        totalDurationMs: number;
        errorMessage: string;
        queryUuid?: string;
        queryStatus?: QueryHistoryStatus;
    }): void {
        this.analytics.trackAccount(args.account, {
            event: 'materialization.failed',
            properties: {
                organizationId: args.account.organization?.organizationUuid,
                materializationUuid: args.materializationUuid,
                queryId: args.queryUuid,
                projectId: args.projectUuid,
                preAggregateDefinitionUuid: args.preAggregateDefinitionUuid,
                preAggregateName: args.preAggregateName,
                trigger: args.trigger,
                materializationStatus: 'failed',
                queryStatus: args.queryStatus,
                totalDurationMs: args.totalDurationMs,
                errorMessage: args.errorMessage,
            },
        });
    }

    private skip(
        args: {
            projectUuid: string;
            preAggregateDefinitionUuid: string;
            trigger: PreAggregateMaterializationTrigger;
        },
        reason: SkipReason,
    ): MaterializationResult {
        this.logger.info('Pre-aggregate refresh decision', {
            projectUuid: args.projectUuid,
            preAggregateDefinitionUuid: args.preAggregateDefinitionUuid,
            trigger: args.trigger,
            reason,
        });
        this.prometheusMetrics?.preAggregateRefreshDecisionCounter?.inc({
            reason,
            trigger: args.trigger,
        });
        return { status: 'skipped', reason };
    }

    async materializePreAggregate(args: {
        account: Account;
        projectUuid: string;
        preAggregateDefinitionUuid: string;
        trigger: PreAggregateMaterializationTrigger;
        scheduleRevision?: string;
    }): Promise<MaterializationResult> {
        let materializationUuid: string | undefined;
        let preAggregateName: string | undefined;
        const startTime = Date.now();

        try {
            let definition =
                await this.preAggregateModel.getPreAggregateDefinitionByUuid({
                    projectUuid: args.projectUuid,
                    preAggregateDefinitionUuid: args.preAggregateDefinitionUuid,
                });

            const automatic =
                args.trigger === 'compile' || args.trigger === 'cron';
            if (!definition && automatic) return this.skip(args, 'ineligible');
            if (!definition) {
                throw new NotFoundError(
                    `Pre-aggregate definition "${args.preAggregateDefinitionUuid}" was not found`,
                );
            }
            preAggregateName = definition.preAggregateDefinition.name;

            const { phase, reuseEnabled } =
                await this.preAggregateModel.getReuseState();
            const automaticEligible =
                definition.automaticEligible ||
                (phase === 'compatibility' &&
                    (await this.preAggregateModel.isLegacyDefinitionAutomaticallyEligible(
                        definition,
                    )));
            if (
                automatic &&
                (!automaticEligible ||
                    !definition.materializationMetricQuery ||
                    definition.materializationQueryError)
            ) {
                return this.skip(args, 'ineligible');
            }
            if (
                args.trigger === 'cron' &&
                (args.scheduleRevision
                    ? args.scheduleRevision !== definition.scheduleRevision
                    : phase === 'active')
            ) {
                return this.skip(args, 'obsolete_schedule');
            }
            const prepared =
                await this.asyncQueryService.prepareRegisteredPreAggregate({
                    account: args.account,
                    projectUuid: args.projectUuid,
                    definition,
                    evaluatedAt: new Date(),
                });
            if (definition.publicationVersion) {
                const current =
                    await this.preAggregateModel.refreshDesiredPreparation({
                        projectUuid: args.projectUuid,
                        preAggregateDefinitionUuid:
                            definition.preAggregateDefinitionUuid,
                        expectedPublicationVersion:
                            definition.publicationVersion,
                        compatibilityHash: prepared.compatibilityHash,
                        physicalOutputContract: prepared.physicalOutputContract,
                        preparationStatus: prepared.compatibilityHash
                            ? 'ready'
                            : 'unverified',
                        materializationMetricQuery:
                            prepared.materializationMetricQuery,
                        materializationQueryError: null,
                        automaticEligible: definition.automaticEligible,
                    });
                if (!current)
                    throw new ParameterError(
                        'Pre-aggregate changed during preparation; refresh it again.',
                    );
                definition = current;
            }
            if (
                args.trigger === 'cron' &&
                args.scheduleRevision !== undefined &&
                args.scheduleRevision !== definition.scheduleRevision
            )
                return this.skip(args, 'obsolete_schedule');
            const sourceName =
                definition.sourceExploreName ??
                prepared.queryComposer.getExplore().name;
            const active =
                await this.preAggregateModel.getActiveMaterialization(
                    args.projectUuid,
                    getPreAggregateExploreName(
                        sourceName,
                        definition.preAggregateDefinition.name,
                    ),
                );
            let usableActive = false;
            if (
                active &&
                prepared.compatibilityHash &&
                active.compatibilityHash === prepared.compatibilityHash
            ) {
                // Query-history retention must not remove our ability to verify
                // storage. The durable materialization URI identifies the object.
                try {
                    const uri = new URL(active.materializationUri);
                    if (
                        uri.protocol === 's3:' &&
                        uri.hostname ===
                            this.lightdashConfig.preAggregates.s3?.bucket
                    ) {
                        const key = decodeURIComponent(uri.pathname.slice(1));
                        usableActive =
                            (await this.preAggregateResultsStorageClient.getFileSize(
                                key,
                                active.format,
                            )) !== null;
                    }
                } catch {
                    // Unreadable storage is a missing baseline, not a failed
                    // refresh attempt. Let this deployment repair it.
                    usableActive = false;
                }
            }
            if (
                args.trigger === 'compile' &&
                phase === 'active' &&
                reuseEnabled &&
                usableActive
            )
                return this.skip(args, 'unchanged_active');
            let reason = 'missing_active';
            if (!prepared.compatibilityHash) reason = 'unknown_hash';
            else if (
                active &&
                active.compatibilityHash !== prepared.compatibilityHash
            )
                reason = 'changed_hash';
            this.prometheusMetrics?.preAggregateRefreshDecisionCounter?.inc({
                reason,
                trigger: args.trigger,
            });
            this.logger.info('Pre-aggregate refresh decision', {
                projectUuid: args.projectUuid,
                preAggregateDefinitionUuid: args.preAggregateDefinitionUuid,
                trigger: args.trigger,
                reason,
            });

            const materializationRow =
                await this.preAggregateModel.insertInProgress({
                    projectUuid: args.projectUuid,
                    preAggregateDefinitionUuid:
                        definition.preAggregateDefinitionUuid,
                    trigger: args.trigger,
                    ...(args.trigger === 'cron'
                        ? { expectedScheduleRevision: args.scheduleRevision }
                        : {}),
                    ...(definition.publicationVersion
                        ? {
                              provenance: {
                                  publicationVersion:
                                      definition.publicationVersion,
                                  compatibilityHash: prepared.compatibilityHash,
                                  evaluatedAt: prepared.evaluatedAt,
                                  physicalOutputContract:
                                      prepared.physicalOutputContract,
                                  pinnedContextHash: prepared.pinnedContextHash,
                                  ...(prepared.executionScopeKeyId
                                      ? {
                                            executionScopeKeyId:
                                                prepared.executionScopeKeyId,
                                        }
                                      : {}),
                              },
                          }
                        : {}),
                });
            materializationUuid = materializationRow.materializationUuid;

            const { materializationMetricQuery } = definition;
            if (!materializationMetricQuery) {
                const errorMessage =
                    definition.materializationQueryError ||
                    'Pre-aggregate definition is missing materialization query';
                await this.preAggregateModel.markFailed({
                    materializationUuid,
                    errorMessage,
                });
                this.trackMaterializationFailed({
                    account: args.account,
                    materializationUuid,
                    projectUuid: args.projectUuid,
                    preAggregateDefinitionUuid: args.preAggregateDefinitionUuid,
                    preAggregateName,
                    trigger: args.trigger,
                    totalDurationMs: Date.now() - startTime,
                    errorMessage,
                });

                return {
                    materializationUuid,
                    status: 'failed',
                };
            }

            this.logger.info(
                `Starting executeAsyncMetricQuery for pre-aggregate materialization for definition ${args.preAggregateDefinitionUuid}`,
            );

            const { queryUuid } = await traceSpan(
                {
                    op: 'preaggregate',
                    name: 'executeAsyncMetricQuery',
                    attributes: {
                        projectUuid: args.projectUuid,
                        materializationUuid,
                    },
                },
                () =>
                    this.asyncQueryService.executePreAggregateMaterialization({
                        account: args.account,
                        projectUuid: args.projectUuid,
                        prepared,
                        materializationUuid:
                            materializationRow.materializationUuid,
                    }),
            );

            this.logger.info(
                `executeAsyncMetricQuery completed for pre-aggregate materialization for definition ${args.preAggregateDefinitionUuid}`,
                {
                    materializationUuid,
                    queryUuid,
                },
            );

            this.logger.info(
                `Starting pollForQueryCompletion for pre-aggregate materialization for definition ${args.preAggregateDefinitionUuid}`,
                {
                    materializationUuid,
                    queryUuid,
                },
            );

            const pollStart = Date.now();
            const queryHistory = await traceSpan(
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
                this.trackMaterializationFailed({
                    account: args.account,
                    materializationUuid,
                    queryUuid,
                    projectUuid: args.projectUuid,
                    preAggregateDefinitionUuid: args.preAggregateDefinitionUuid,
                    preAggregateName,
                    trigger: args.trigger,
                    queryStatus: queryHistory.status,
                    totalDurationMs: durationMs,
                    errorMessage,
                });
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
                this.trackMaterializationFailed({
                    account: args.account,
                    materializationUuid,
                    queryUuid,
                    projectUuid: args.projectUuid,
                    preAggregateDefinitionUuid: args.preAggregateDefinitionUuid,
                    preAggregateName,
                    trigger: args.trigger,
                    queryStatus: queryHistory.status,
                    totalDurationMs: Date.now() - startTime,
                    errorMessage:
                        'Materialization query completed without a persisted results file',
                });

                return {
                    materializationUuid,
                    status: 'failed',
                    queryUuid,
                };
            }

            let outputColumns = queryHistory.columns;
            if (!outputColumns && queryHistory.totalRowCount === 0) {
                // Empty JSONL has no row from which to infer types. Supply the
                // compiler's explicit schema so DuckDB can read an empty table.
                const emptyColumns: ResultColumns = {};
                for (const column of prepared.physicalOutputContract.columns) {
                    const type = Object.values(DimensionType).find(
                        (candidate) => candidate === column.type,
                    );
                    if (!type)
                        throw new ParameterError(
                            'Pre-aggregate output type could not be verified',
                        );
                    emptyColumns[column.name] = {
                        reference: column.name,
                        type,
                    };
                }
                outputColumns = emptyColumns;
            }
            const expectedColumns = prepared.physicalOutputContract.columns;
            if (
                !outputColumns ||
                Object.keys(outputColumns).length !== expectedColumns.length ||
                expectedColumns.some(
                    (column) =>
                        outputColumns?.[column.name]?.type !== column.type,
                )
            ) {
                throw new ParameterError(
                    'Materialization output does not match its prepared column contract',
                );
            }
            const columnCount = Object.keys(outputColumns).length;

            // Get file size from S3 and promote to active — timed together
            const promoteStart = Date.now();
            const totalBytes = await traceSpan(
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

            if (totalBytes === null)
                throw new ParameterError(
                    'Materialization output could not be verified in storage',
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

            const { status } = await traceSpan(
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
                        columns: outputColumns,
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
            this.trackMaterializationCompleted({
                account: args.account,
                materializationUuid,
                queryUuid,
                projectUuid: args.projectUuid,
                preAggregateDefinitionUuid: args.preAggregateDefinitionUuid,
                preAggregateName,
                trigger: args.trigger,
                status,
                format: this.getMaterializationFormat(),
                rowCount: queryHistory.totalRowCount,
                columnCount,
                totalBytes,
                warehouseExecutionTimeMs: queryHistory.warehouseExecutionTimeMs,
                totalDurationMs: durationMs,
            });

            return {
                materializationUuid,
                status,
                queryUuid,
            };
        } catch (error) {
            if (
                error instanceof ObsoletePreAggregateScheduleError &&
                !materializationUuid
            )
                return this.skip(args, 'obsolete_schedule');
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
                const errorMessage =
                    error instanceof Error
                        ? error.message
                        : 'Unknown materialization error';
                await this.preAggregateModel.markFailed({
                    materializationUuid,
                    errorMessage,
                });
                this.trackMaterializationFailed({
                    account: args.account,
                    materializationUuid,
                    projectUuid: args.projectUuid,
                    preAggregateDefinitionUuid: args.preAggregateDefinitionUuid,
                    preAggregateName,
                    trigger: args.trigger,
                    totalDurationMs: durationMs,
                    errorMessage,
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
              queryUuid: string | null;
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
