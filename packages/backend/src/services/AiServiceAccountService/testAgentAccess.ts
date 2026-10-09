import {
    NotFoundError,
    ParameterError,
    QueryExecutionContext,
    WarehouseTypes,
    type Account,
    type AgentAccessDataset,
    type AgentAccessReport,
    type AgentAccessTestRequest,
    type CreateWarehouseCredentials,
    type UUID,
} from '@lightdash/common';
import {
    AgentAccessProbeError,
    BigqueryAgentAccessProbe,
    BigqueryWarehouseClient,
    classifyBigqueryAccessError,
    type AgentAccessInventoryTable,
} from '@lightdash/warehouses';
import { type LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { trackSafely } from '../../analytics/trackSafely';
import { type AiServiceAccountCredentialsModel } from '../../models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { connectionContextFromAccount } from '../WarehouseClientFactory/ConnectionContext';
import { type WarehouseClientFactory } from '../WarehouseClientFactory/WarehouseClientFactory';
import {
    applyAiServiceAccountCredentials,
    mergeAiServiceAccountCredentials,
} from './applyAiServiceAccountCredentials';
import {
    AiServiceAccountSlotResolutionError,
    AiServiceAccountSlotResolver,
    type AiServiceAccountSlotDependencies,
} from './resolveAiServiceAccountSlot';

type Dependencies = AiServiceAccountSlotDependencies & {
    analytics: Pick<LightdashAnalytics, 'track'>;
    aiServiceAccountCredentialsModel: Pick<
        AiServiceAccountCredentialsModel,
        'getSecrets' | 'getReplaceableSecrets' | 'getSlot'
    >;
    projectModel: Pick<
        ProjectModel,
        'findExploreTableSummariesFromCache' | 'getSummary'
    >;
    warehouseClientFactory: Pick<WarehouseClientFactory, 'withWarehouseClient'>;
};

type Input = {
    account: Account;
    projectUuid: UUID;
    organizationUuid: UUID;
    warehouseConnectionUuid: UUID | null;
    connection: CreateWarehouseCredentials;
    request: AgentAccessTestRequest;
};

const bounded = async <T>(
    work: () => Promise<T>,
    deadline: number,
): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        if (deadline <= Date.now()) throw new AgentAccessProbeError('timeout');
        return await Promise.race([
            work(),
            new Promise<never>((_, reject) => {
                timer = setTimeout(
                    () => reject(new AgentAccessProbeError('timeout')),
                    deadline - Date.now(),
                );
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
};

const mapConcurrent = async <T, R>(
    items: T[],
    concurrency: number,
    run: (item: T) => Promise<R>,
): Promise<R[]> => {
    const results: R[] = new Array(items.length);
    let next = 0;
    const worker = async (): Promise<void> => {
        if (next >= items.length) return;
        const index = next;
        next += 1;
        results[index] = await run(items[index]);
        await worker();
    };
    await Promise.all(
        Array.from({ length: Math.min(concurrency, items.length) }, worker),
    );
    return results;
};

const failureMessages: Record<
    NonNullable<AgentAccessReport['failureReason']>,
    string
> = {
    invalid_credentials:
        'Could not verify the AI service account. Check the saved key.',
    job_permission_denied:
        'The AI service account needs permission to create BigQuery jobs in the execution project.',
    warehouse_denied: 'BigQuery refused the AI service account connection.',
    baseline_failed:
        'Could not list all tables with the normal connection. Check its credentials and dataset access.',
    timeout: 'The access check timed out. Try again.',
    quota: 'BigQuery could not check access because a quota was reached. Try again later.',
    unavailable: 'BigQuery is unavailable. Try again later.',
    unknown:
        'Could not verify agent access. Check the credentials and connection settings.',
};

export const testAgentAccess = async (
    input: Input,
    deps: Dependencies,
): Promise<AgentAccessReport> => {
    const {
        account,
        projectUuid,
        organizationUuid,
        warehouseConnectionUuid,
        connection,
        request,
    } = input;
    if (
        request.credentials !== null &&
        request.credentials.type !== connection.type
    )
        throw new ParameterError(
            'The AI service account must match the connection warehouse type.',
        );
    const started = Date.now();
    const deadline = started + 60_000;
    const progress: {
        phase: 'credentials' | 'identity' | 'baseline' | 'tables';
    } = { phase: 'credentials' };
    let deadlineReached = false;
    let inheritedFromProjectUuid: string | null = null;
    let report: AgentAccessReport = {
        warehouseType: connection.type,
        subject: { kind: 'ai_service_account' },
        principal: null,
        credentialSource: request.credentials === null ? 'saved' : 'submitted',
        status: 'failed',
        failureReason: null,
        message: null,
        datasets: [],
        tables: [],
        readableCount: 0,
        blockedCount: 0,
        errorCount: 0,
        checkedCount: 0,
        notCheckedCount: 0,
        totalCount: null,
        truncatedCount: 0,
        checkedAt: new Date(),
    };
    const withProbe = <T>(
        credentials: CreateWarehouseCredentials,
        agentSession: boolean,
        run: (probe: BigqueryAgentAccessProbe) => Promise<T>,
    ) =>
        deps.warehouseClientFactory.withWarehouseClient(
            {
                kind: 'bypass',
                mode: 'connection_test',
                agentSession,
                projectUuid,
                credentials,
            },
            connectionContextFromAccount(account, {
                organizationUuid,
                queryContext: QueryExecutionContext.API,
            }),
            ({ warehouseClient }) => {
                if (!(warehouseClient instanceof BigqueryWarehouseClient))
                    throw new ParameterError(
                        'This warehouse does not support agent access tests.',
                    );
                return run(new BigqueryAgentAccessProbe(warehouseClient));
            },
        );
    try {
        const resolved =
            request.credentials === null
                ? await new AiServiceAccountSlotResolver(deps).resolve({
                      projectUuid,
                      connection: warehouseConnectionUuid,
                  })
                : null;
        inheritedFromProjectUuid = resolved?.inherited
            ? resolved.sourceProjectUuid
            : null;
        const secrets =
            request.credentials === null
                ? (resolved?.slot.secrets ?? null)
                : mergeAiServiceAccountCredentials(
                      request.credentials,
                      await deps.aiServiceAccountCredentialsModel.getReplaceableSecrets(
                          projectUuid,
                          warehouseConnectionUuid,
                      ),
                  );
        if (secrets === null)
            throw new NotFoundError(
                'The connection has no AI service account.',
            );
        const credentials = applyAiServiceAccountCredentials(
            connection,
            secrets,
        );
        await withProbe(credentials, true, async (agent) => {
            progress.phase = 'identity';
            report.principal = await agent.principal(deadline);
            progress.phase = 'baseline';
            const discoveryDeadline = Math.min(deadline, Date.now() + 15_000);
            const inventory = await bounded(async () => {
                if (connection.type !== WarehouseTypes.BIGQUERY)
                    throw new ParameterError(
                        'This warehouse does not support agent access tests.',
                    );
                const scope: AgentAccessDataset[] = [
                    {
                        database: connection.project,
                        schema: connection.dataset,
                    },
                ];
                if (warehouseConnectionUuid === null) {
                    const summaries =
                        await deps.projectModel.findExploreTableSummariesFromCache(
                            projectUuid,
                        );
                    for (const summary of Object.values(summaries)) {
                        if (!summary.errors)
                            for (const table of Object.values(summary.tables)) {
                                if (table.database && table.schema)
                                    scope.push({
                                        database: table.database,
                                        schema: table.schema,
                                    });
                            }
                    }
                }
                report.datasets = [
                    ...new Map(
                        scope.map((dataset) => [
                            JSON.stringify([dataset.database, dataset.schema]),
                            dataset,
                        ]),
                    ).values(),
                ];
                return withProbe(connection, false, async (baseline) =>
                    (
                        await mapConcurrent(report.datasets, 2, (dataset) =>
                            baseline.listTables(dataset, discoveryDeadline),
                        )
                    ).flat(),
                );
            }, discoveryDeadline);
            progress.phase = 'tables';
            const key = (table: AgentAccessInventoryTable) =>
                JSON.stringify([table.database, table.schema, table.name]);
            const tables = [
                ...new Map(
                    inventory.map((table) => [key(table), table]),
                ).values(),
            ].sort((a, b) => {
                for (const field of ['database', 'schema', 'name'] as const) {
                    if (a[field] < b[field]) return -1;
                    if (a[field] > b[field]) return 1;
                }
                return 0;
            });
            let fatal: AgentAccessProbeError | null = null;
            const results = await mapConcurrent(
                tables.slice(0, 200),
                5,
                async (table) => {
                    const { location, ...name } = table;
                    const unfinished = {
                        ...name,
                        status: {
                            kind: 'not_checked',
                            reason: 'timeout',
                        } as const,
                    };
                    if (fatal !== null) return unfinished;
                    if (Date.now() >= deadline) {
                        deadlineReached = true;
                        return unfinished;
                    }
                    try {
                        const status = await agent.probe(table, deadline);
                        if (Date.now() >= deadline) {
                            deadlineReached = true;
                            return unfinished;
                        }
                        return { ...name, status };
                    } catch (error) {
                        fatal =
                            error instanceof AgentAccessProbeError
                                ? error
                                : new AgentAccessProbeError('unknown');
                        return unfinished;
                    }
                },
            );
            if (fatal !== null) throw fatal;
            report.tables = results;
            report.totalCount = tables.length;
            report.truncatedCount = Math.max(0, tables.length - 200);
            report.readableCount = results.filter(
                (table) => table.status.kind === 'readable',
            ).length;
            report.blockedCount = results.filter(
                (table) => table.status.kind === 'blocked',
            ).length;
            report.errorCount = results.filter(
                (table) => table.status.kind === 'error',
            ).length;
            report.notCheckedCount = results.filter(
                (table) => table.status.kind === 'not_checked',
            ).length;
            report.checkedCount =
                report.readableCount + report.blockedCount + report.errorCount;
            report.status =
                report.errorCount +
                    report.notCheckedCount +
                    report.truncatedCount >
                0
                    ? 'partial'
                    : 'complete';
        });
    } catch (error) {
        if (error instanceof AiServiceAccountSlotResolutionError)
            inheritedFromProjectUuid = error.inheritedFromProjectUuid;
        if (error instanceof NotFoundError && progress.phase === 'credentials')
            throw error;
        const classified = classifyBigqueryAccessError(
            error,
            progress.phase === 'identity' ? 'identity' : 'tables',
        );
        let reason:
            | Exclude<AgentAccessReport['failureReason'], null>
            | 'not_found'
            | 'unsupported';
        if (progress.phase === 'baseline') reason = 'baseline_failed';
        else if (progress.phase === 'credentials')
            reason = 'invalid_credentials';
        else if (classified.kind === 'blocked') reason = 'warehouse_denied';
        else reason = classified.reason;
        const failureReason =
            reason === 'not_found' || reason === 'unsupported'
                ? 'unknown'
                : reason;
        report = {
            ...report,
            status: 'failed',
            failureReason,
            message: failureMessages[failureReason],
            tables: [],
            totalCount: null,
            readableCount: 0,
            blockedCount: 0,
            errorCount: 0,
            checkedCount: 0,
            notCheckedCount: 0,
            truncatedCount: 0,
        };
    }
    report.checkedAt = new Date();
    trackSafely(() =>
        deps.analytics.track({
            event: 'agent_identity.access_tested',
            userId: account.user.id,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                userId: account.user.id,
                connectionUuid: warehouseConnectionUuid,
                warehouseType: connection.type,
                subjectKind: report.subject.kind,
                credentialSource: report.credentialSource,
                inheritedFromProjectUuid,
                entryPoint: request.entryPoint,
                status: report.status,
                failureReason: report.failureReason,
                readableCount: report.readableCount,
                blockedCount: report.blockedCount,
                errorCount: report.errorCount,
                checkedCount: report.checkedCount,
                notCheckedCount: report.notCheckedCount,
                totalCount: report.totalCount,
                truncatedCount: report.truncatedCount,
                datasetCount: report.datasets.length,
                durationMs: Date.now() - started,
                capReached: report.truncatedCount > 0,
                deadlineReached: deadlineReached || Date.now() >= deadline,
            },
        }),
    );
    return report;
};
