import { subject } from '@casl/ability';
import {
    ForbiddenError,
    getErrorMessage,
    JobStatusType,
    JobStepStatusType,
    JobStepType,
    JobType,
    NotFoundError,
    OnboardingStepStatus,
    OnboardingStepType,
    QueryExecutionContext,
    WarehouseTypes,
    type CreateJob,
    type DimensionType,
    type OnboardingProfilePayload,
    type ProfiledTable,
    type ProfileErrorResult,
    type ProfileResult,
    type SessionUser,
    type WarehouseCatalog,
    type WarehouseClient,
    type WarehouseTables,
} from '@lightdash/common';
import pLimit from 'p-limit';
import { v4 as uuidv4 } from 'uuid';
import { JobModel } from '../../models/JobModel/JobModel';
import { OnboardingProjectStateModel } from '../../models/OnboardingProjectStateModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { BaseService } from '../BaseService';
import { ProjectService } from '../ProjectService/ProjectService';
import {
    inferProfile,
    limitProfileTables,
    MAX_PROFILE_TABLES,
} from './profileInference';

const PROFILE_TIMEOUT_MS = 120_000;
const PROFILE_FIELDS_CONCURRENCY = 5;
const PROFILE_TIMEOUT_MESSAGE =
    'Warehouse profiling timed out after 120 seconds. Check warehouse availability and table metadata permissions, then try again.';

const PROFILE_STEPS = [
    JobStepType.ONBOARDING_PROFILE_CONNECTING,
    JobStepType.ONBOARDING_PROFILE_LISTING_TABLES,
    JobStepType.ONBOARDING_PROFILE_SAMPLING_COLUMNS,
    JobStepType.ONBOARDING_PROFILE_INFERRING_RELATIONSHIPS,
] as const;

class ProfileTimeoutError extends Error {}

type ProjectProfileServiceArguments = {
    jobModel: JobModel;
    onboardingProjectStateModel: OnboardingProjectStateModel;
    profileTimeoutMs?: number;
    projectModel: ProjectModel;
    projectService: ProjectService;
    schedulerClient: SchedulerClient;
};

export class ProjectProfileService extends BaseService {
    private readonly jobModel: JobModel;

    private readonly onboardingProjectStateModel: OnboardingProjectStateModel;

    private readonly profileTimeoutMs: number;

    private readonly projectModel: ProjectModel;

    private readonly projectService: ProjectService;

    private readonly schedulerClient: SchedulerClient;

    constructor(args: ProjectProfileServiceArguments) {
        super();
        this.jobModel = args.jobModel;
        this.onboardingProjectStateModel = args.onboardingProjectStateModel;
        this.profileTimeoutMs = args.profileTimeoutMs ?? PROFILE_TIMEOUT_MS;
        this.projectModel = args.projectModel;
        this.projectService = args.projectService;
        this.schedulerClient = args.schedulerClient;
    }

    private async assertCanManageProfile(
        user: SessionUser,
        projectUuid: string,
    ): Promise<{ organizationUuid: string }> {
        const { organizationUuid, type } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'create',
                subject('Job', { organizationUuid, projectUuid }),
            ) ||
            auditedAbility.cannot(
                'manage',
                subject('CompileProject', {
                    organizationUuid,
                    projectUuid,
                    type,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        return { organizationUuid };
    }

    async scheduleProfile(
        user: SessionUser,
        projectUuid: string,
    ): Promise<{ jobUuid: string }> {
        const { organizationUuid } = await this.assertCanManageProfile(
            user,
            projectUuid,
        );
        const job: CreateJob = {
            jobUuid: uuidv4(),
            jobType: JobType.ONBOARDING_PROFILE,
            jobStatus: JobStatusType.STARTED,
            userUuid: user.userUuid,
            projectUuid,
            steps: PROFILE_STEPS.map((stepType) => ({ stepType })),
        };

        await this.jobModel.create(job);
        await this.onboardingProjectStateModel.upsert(
            projectUuid,
            OnboardingStepType.PROFILE,
            OnboardingStepStatus.IN_PROGRESS,
            null,
        );
        await this.schedulerClient.onboardingProfile({
            createdByUserUuid: user.userUuid,
            userUuid: user.userUuid,
            organizationUuid,
            projectUuid,
            jobUuid: job.jobUuid,
        });
        return { jobUuid: job.jobUuid };
    }

    async getProfile(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ProfileResult> {
        const project = await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        const profile = await this.onboardingProjectStateModel.find(
            projectUuid,
            OnboardingStepType.PROFILE,
        );
        if (
            !profile ||
            profile.status !== OnboardingStepStatus.COMPLETED ||
            profile.result === null
        ) {
            throw new NotFoundError(
                'No completed warehouse profile exists for this project',
            );
        }
        return profile.result as ProfileResult;
    }

    private static getConnectedSchema(
        warehouseClient: WarehouseClient,
    ): string | undefined {
        const { credentials } = warehouseClient;
        switch (credentials.type) {
            case WarehouseTypes.BIGQUERY:
                return credentials.dataset || undefined;
            case WarehouseTypes.DATABRICKS:
                return credentials.database || undefined;
            default:
                return credentials.schema || undefined;
        }
    }

    private static getColumns(
        catalog: WarehouseCatalog,
        table: WarehouseTables[number],
    ): ProfiledTable['columns'] {
        const fields =
            catalog[table.database]?.[table.schema]?.[table.table] ?? {};
        return Object.entries(fields).map(([name, type]) => ({
            name,
            type: type as DimensionType,
        }));
    }

    private async profileWarehouse(
        user: SessionUser,
        organizationUuid: string,
        projectUuid: string,
        signal: AbortSignal,
        setActiveStep: (step: JobStepType | null) => void,
        jobUuid: string,
    ): Promise<ProfileResult> {
        let warehouseClient: WarehouseClient | null = null;
        const cleanup: { disconnect: (() => Promise<void>) | null } = {
            disconnect: null,
        };

        const runStep = async <T>(
            step: JobStepType,
            callback: () => Promise<T>,
        ): Promise<T> => {
            if (signal.aborted) throw new ProfileTimeoutError();
            setActiveStep(step);
            await this.jobModel.startJobStep(jobUuid, step);
            try {
                const result = await callback();
                if (signal.aborted) throw new ProfileTimeoutError();
                await this.jobModel.updateJobStep(
                    jobUuid,
                    JobStepStatusType.DONE,
                    step,
                );
                setActiveStep(null);
                return result;
            } catch (error) {
                if (!signal.aborted) {
                    await this.jobModel.updateJobStep(
                        jobUuid,
                        JobStepStatusType.ERROR,
                        step,
                        getErrorMessage(error),
                    );
                    setActiveStep(null);
                }
                throw error;
            }
        };

        try {
            await runStep(
                JobStepType.ONBOARDING_PROFILE_CONNECTING,
                async () => {
                    const connection =
                        await this.projectService.getWarehouseClientForUser(
                            user,
                            projectUuid,
                        );
                    warehouseClient = connection.warehouseClient;
                    cleanup.disconnect = () =>
                        connection.sshTunnel.disconnect();
                },
            );

            const warehouseTables = await runStep(
                JobStepType.ONBOARDING_PROFILE_LISTING_TABLES,
                async () => {
                    if (!warehouseClient) throw new ProfileTimeoutError();
                    const connectedSchema =
                        ProjectProfileService.getConnectedSchema(
                            warehouseClient,
                        );
                    const tables = await warehouseClient.getAllTables(
                        connectedSchema,
                        {
                            organization_uuid: organizationUuid,
                            project_uuid: projectUuid,
                            user_uuid: user.userUuid,
                            query_context: QueryExecutionContext.API,
                        },
                    );
                    // Not every warehouse client honors the schema argument
                    if (connectedSchema) {
                        return tables.filter(
                            (table) =>
                                table.schema.toLowerCase() ===
                                connectedSchema.toLowerCase(),
                        );
                    }
                    return tables;
                },
            );
            const limited = limitProfileTables(
                warehouseTables,
                MAX_PROFILE_TABLES,
            );

            const profiledTables = await runStep(
                JobStepType.ONBOARDING_PROFILE_SAMPLING_COLUMNS,
                async () => {
                    if (!warehouseClient) throw new ProfileTimeoutError();
                    const limit = pLimit(PROFILE_FIELDS_CONCURRENCY);
                    return Promise.all(
                        limited.tables.map((warehouseTable) =>
                            limit(async (): Promise<ProfiledTable> => {
                                if (signal.aborted)
                                    throw new ProfileTimeoutError();
                                const catalog =
                                    await warehouseClient!.getFields(
                                        warehouseTable.table,
                                        warehouseTable.schema,
                                        warehouseTable.database,
                                        {
                                            organization_uuid: organizationUuid,
                                            project_uuid: projectUuid,
                                            user_uuid: user.userUuid,
                                            query_context:
                                                QueryExecutionContext.API,
                                        },
                                    );
                                return {
                                    database: warehouseTable.database,
                                    schema: warehouseTable.schema,
                                    name: warehouseTable.table,
                                    tableType: warehouseTable.tableType ?? null,
                                    rowCount: warehouseTable.rowCount ?? null,
                                    columns: ProjectProfileService.getColumns(
                                        catalog,
                                        warehouseTable,
                                    ),
                                };
                            }),
                        ),
                    );
                },
            );

            return await runStep(
                JobStepType.ONBOARDING_PROFILE_INFERRING_RELATIONSHIPS,
                async () =>
                    inferProfile({
                        tables: profiledTables,
                        truncated: limited.truncated,
                        profiledAt: new Date().toISOString(),
                    }),
            );
        } finally {
            if (cleanup.disconnect) await cleanup.disconnect();
        }
    }

    async runProfileJob(
        user: SessionUser,
        payload: OnboardingProfilePayload,
    ): Promise<void> {
        let activeStep: JobStepType | null = null;
        const abortController = new AbortController();
        let timeoutHandle: NodeJS.Timeout | undefined;

        await this.jobModel.update(payload.jobUuid, {
            jobStatus: JobStatusType.RUNNING,
        });
        try {
            const { organizationUuid } = await this.assertCanManageProfile(
                user,
                payload.projectUuid,
            );
            const result = await Promise.race([
                this.profileWarehouse(
                    user,
                    organizationUuid,
                    payload.projectUuid,
                    abortController.signal,
                    (step) => {
                        activeStep = step;
                    },
                    payload.jobUuid,
                ),
                new Promise<never>((_resolve, reject) => {
                    timeoutHandle = setTimeout(() => {
                        abortController.abort();
                        reject(new ProfileTimeoutError());
                    }, this.profileTimeoutMs);
                }),
            ]);

            await this.onboardingProjectStateModel.upsert(
                payload.projectUuid,
                OnboardingStepType.PROFILE,
                OnboardingStepStatus.COMPLETED,
                result,
            );
            await this.jobModel.update(payload.jobUuid, {
                jobStatus: JobStatusType.DONE,
            });
        } catch (error) {
            const errorMessage =
                error instanceof ProfileTimeoutError
                    ? PROFILE_TIMEOUT_MESSAGE
                    : getErrorMessage(error);
            if (activeStep) {
                await this.jobModel.updateJobStep(
                    payload.jobUuid,
                    JobStepStatusType.ERROR,
                    activeStep,
                    errorMessage,
                );
            }
            await this.jobModel.setPendingJobsToSkipped(payload.jobUuid);
            await this.jobModel.update(payload.jobUuid, {
                jobStatus: JobStatusType.ERROR,
            });
            const errorResult: ProfileErrorResult = { error: errorMessage };
            await this.onboardingProjectStateModel.upsert(
                payload.projectUuid,
                OnboardingStepType.PROFILE,
                OnboardingStepStatus.ERROR,
                errorResult,
            );
            throw error;
        } finally {
            if (timeoutHandle) clearTimeout(timeoutHandle);
        }
    }
}
