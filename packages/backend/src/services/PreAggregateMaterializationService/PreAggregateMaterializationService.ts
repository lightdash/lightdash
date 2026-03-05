import {
    NotFoundError,
    QueryExecutionContext,
    QueryHistoryStatus,
    type Account,
    type ActiveMaterializationDetails,
    type ApiPreAggregateMaterializationsResults,
    type KnexPaginateArgs,
    type KnexPaginatedData,
    type PreAggregateMaterializationTrigger,
} from '@lightdash/common';
import { type LightdashConfig } from '../../config/parseConfig';
import { PreAggregateModel } from '../../models/PreAggregateModel';
import { type QueryHistoryModel } from '../../models/QueryHistoryModel/QueryHistoryModel';
import type PrometheusMetrics from '../../prometheus/PrometheusMetrics';
import { type AsyncQueryService } from '../AsyncQueryService/AsyncQueryService';

const QUERY_POLL_INTERVAL_MS = 1000;
const QUERY_POLL_TIMEOUT_MS = 30 * 60 * 1000;

export class PreAggregateMaterializationService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly preAggregateModel: PreAggregateModel;

    private readonly queryHistoryModel: QueryHistoryModel;

    private readonly asyncQueryService: AsyncQueryService;

    private readonly prometheusMetrics: PrometheusMetrics | undefined;

    constructor(args: {
        lightdashConfig: LightdashConfig;
        preAggregateModel: PreAggregateModel;
        queryHistoryModel: QueryHistoryModel;
        asyncQueryService: AsyncQueryService;
        prometheusMetrics?: PrometheusMetrics;
    }) {
        this.lightdashConfig = args.lightdashConfig;
        this.preAggregateModel = args.preAggregateModel;
        this.queryHistoryModel = args.queryHistoryModel;
        this.asyncQueryService = args.asyncQueryService;
        this.prometheusMetrics = args.prometheusMetrics;
    }

    private getMaterializationUri(resultsFileName: string): string {
        const bucket = this.lightdashConfig.preAggregates.s3?.bucket;

        if (!bucket) {
            throw new Error(
                'Missing pre-aggregate S3 bucket configuration for materializations',
            );
        }

        return `s3://${bucket}/${resultsFileName}.jsonl`;
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

            const { queryUuid } =
                await this.asyncQueryService.executeAsyncMetricQuery({
                    account: args.account,
                    projectUuid: args.projectUuid,
                    context:
                        QueryExecutionContext.PRE_AGGREGATE_MATERIALIZATION,
                    metricQuery: materializationMetricQuery.metricQuery,
                    invalidateCache: true,
                });

            await this.preAggregateModel.attachQueryUuid({
                materializationUuid,
                queryUuid,
            });

            const queryHistory =
                await this.queryHistoryModel.pollForQueryCompletion({
                    queryUuid,
                    account: args.account,
                    projectUuid: args.projectUuid,
                    initialBackoffMs: QUERY_POLL_INTERVAL_MS,
                    maxBackoffMs: QUERY_POLL_INTERVAL_MS,
                    timeoutMs: QUERY_POLL_TIMEOUT_MS,
                    throwOnCancelled: false,
                    throwOnError: false,
                });

            if (queryHistory.status !== QueryHistoryStatus.READY) {
                const errorMessage =
                    queryHistory.error ||
                    `Materialization query ${queryUuid} did not complete successfully`;

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

            const { status } = await this.preAggregateModel.promoteToActive({
                materializationUuid,
                queryUuid,
                materializationUri: this.getMaterializationUri(
                    queryHistory.resultsFileName,
                ),
                materializedAt: queryHistory.resultsUpdatedAt || new Date(),
                rowCount: queryHistory.totalRowCount,
                columns: queryHistory.columns,
            });

            const durationMs = Date.now() - startTime;
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
              format: 'jsonl';
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
