import { subject } from '@casl/ability';
import {
    ExploreCompiler,
    ExploreType,
    ForbiddenError,
    getErrorMessage,
    InlineErrorType,
    isExploreError,
    JobStatusType,
    JobStepStatusType,
    JobStepType,
    JobType,
    NotFoundError,
    OnboardingStepStatus,
    OnboardingStepType,
    ParameterError,
    type CreateJob,
    type Explore,
    type ExploreError,
    type OnboardingSemanticPayload,
    type ProfileResult,
    type SemanticLayerDimension,
    type SemanticLayerExplore,
    type SemanticLayerMetric,
    type SemanticLayerResult,
    type SessionUser,
    type UpdateSemanticLayerFieldRequest,
    type WarehouseClient,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';
import { JobModel } from '../../models/JobModel/JobModel';
import { OnboardingProjectStateModel } from '../../models/OnboardingProjectStateModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { BaseService } from '../BaseService';
import { ProjectService } from '../ProjectService/ProjectService';
import {
    generateSemanticLayer,
    type SemanticGenerationOutput,
} from './semanticGeneration';

const SEMANTIC_STEPS = [
    JobStepType.ONBOARDING_SEMANTIC_GENERATING_EXPLORES,
    JobStepType.ONBOARDING_SEMANTIC_COMPILING_VALIDATING,
    JobStepType.ONBOARDING_SEMANTIC_SAVING,
] as const;

type SemanticGenerationServiceArguments = {
    jobModel: JobModel;
    onboardingProjectStateModel: OnboardingProjectStateModel;
    projectModel: ProjectModel;
    projectService: ProjectService;
    schedulerClient: SchedulerClient;
    semanticGenerator?: typeof generateSemanticLayer;
};

type CompiledGeneration = {
    explores: (Explore | ExploreError)[];
    successfulExplores: Explore[];
    validationErrors: SemanticLayerResult['validationErrors'];
};

export class SemanticGenerationService extends BaseService {
    private readonly jobModel: JobModel;

    private readonly onboardingProjectStateModel: OnboardingProjectStateModel;

    private readonly projectModel: ProjectModel;

    private readonly projectService: ProjectService;

    private readonly schedulerClient: SchedulerClient;

    private readonly semanticGenerator: typeof generateSemanticLayer;

    constructor(args: SemanticGenerationServiceArguments) {
        super();
        this.jobModel = args.jobModel;
        this.onboardingProjectStateModel = args.onboardingProjectStateModel;
        this.projectModel = args.projectModel;
        this.projectService = args.projectService;
        this.schedulerClient = args.schedulerClient;
        this.semanticGenerator =
            args.semanticGenerator ?? generateSemanticLayer;
    }

    private async assertCanManageSemanticLayer(
        user: SessionUser,
        projectUuid: string,
        requireJobPermission: boolean,
    ): Promise<{ organizationUuid: string }> {
        const { organizationUuid, type } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            (requireJobPermission &&
                auditedAbility.cannot(
                    'create',
                    subject('Job', { organizationUuid, projectUuid }),
                )) ||
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

    private async getCompletedProfile(projectUuid: string) {
        const profile = await this.onboardingProjectStateModel.find(
            projectUuid,
            OnboardingStepType.PROFILE,
        );
        if (
            !profile ||
            profile.status !== OnboardingStepStatus.COMPLETED ||
            profile.result === null
        ) {
            throw new ParameterError(
                'A completed warehouse profile is required before generating the semantic layer',
            );
        }
        return profile.result as ProfileResult;
    }

    private static getStoredSemanticLayerResult(
        result: Record<string, unknown> | null | undefined,
    ): SemanticLayerResult | null {
        if (result === null || !Array.isArray(result?.explores)) return null;
        return result as SemanticLayerResult;
    }

    async scheduleGeneration(
        user: SessionUser,
        projectUuid: string,
    ): Promise<{ jobUuid: string }> {
        const { organizationUuid } = await this.assertCanManageSemanticLayer(
            user,
            projectUuid,
            true,
        );
        await this.getCompletedProfile(projectUuid);
        const existingJob =
            await this.jobModel.findMostRecentJobByProjectAndType(
                projectUuid,
                JobType.ONBOARDING_SEMANTIC,
            );
        if (
            existingJob?.jobStatus === JobStatusType.STARTED ||
            existingJob?.jobStatus === JobStatusType.RUNNING
        ) {
            return { jobUuid: existingJob.jobUuid };
        }
        const previousSemanticLayer =
            await this.onboardingProjectStateModel.find(
                projectUuid,
                OnboardingStepType.SEMANTIC_LAYER,
            );
        const previousSemanticLayerResult =
            previousSemanticLayer?.status === OnboardingStepStatus.COMPLETED
                ? SemanticGenerationService.getStoredSemanticLayerResult(
                      previousSemanticLayer.result,
                  )
                : null;
        const job: CreateJob = {
            jobUuid: uuidv4(),
            jobType: JobType.ONBOARDING_SEMANTIC,
            jobStatus: JobStatusType.STARTED,
            userUuid: user.userUuid,
            projectUuid,
            steps: SEMANTIC_STEPS.map((stepType) => ({ stepType })),
        };
        await this.jobModel.create(job);
        await this.onboardingProjectStateModel.upsert(
            projectUuid,
            OnboardingStepType.SEMANTIC_LAYER,
            OnboardingStepStatus.IN_PROGRESS,
            previousSemanticLayerResult,
        );
        await this.schedulerClient.onboardingSemantic({
            createdByUserUuid: user.userUuid,
            userUuid: user.userUuid,
            organizationUuid,
            projectUuid,
            jobUuid: job.jobUuid,
        });
        return { jobUuid: job.jobUuid };
    }

    async getSemanticLayer(
        user: SessionUser,
        projectUuid: string,
    ): Promise<SemanticLayerResult> {
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
        const semanticLayer = await this.onboardingProjectStateModel.find(
            projectUuid,
            OnboardingStepType.SEMANTIC_LAYER,
        );
        if (
            !semanticLayer ||
            semanticLayer.status !== OnboardingStepStatus.COMPLETED ||
            semanticLayer.result === null
        ) {
            throw new NotFoundError(
                'No completed semantic layer exists for this project',
            );
        }
        return semanticLayer.result as SemanticLayerResult;
    }

    private static compileGeneration(
        generated: SemanticGenerationOutput,
        warehouseClient: WarehouseClient,
    ): CompiledGeneration {
        const compiler = new ExploreCompiler(warehouseClient);
        const explores = generated.explores.map<Explore | ExploreError>(
            (definition) => {
                try {
                    return {
                        ...compiler.compileExplore({
                            name: definition.name,
                            label: definition.label,
                            tags: [],
                            baseTable: definition.baseTable,
                            joinedTables: definition.joinedTables,
                            tables: generated.tables,
                            targetDatabase: warehouseClient.getAdapterType(),
                            meta: {},
                        }),
                        type: ExploreType.VIRTUAL,
                    };
                } catch (error) {
                    return {
                        name: definition.name,
                        label: definition.label,
                        type: ExploreType.VIRTUAL,
                        errors: [
                            {
                                type: InlineErrorType.METADATA_PARSE_ERROR,
                                message: getErrorMessage(error),
                            },
                        ],
                    };
                }
            },
        );
        const successfulExplores = explores.filter(
            (explore): explore is Explore => !isExploreError(explore),
        );
        const validationErrors = explores.flatMap((explore) =>
            isExploreError(explore)
                ? explore.errors.map((error) => ({
                      exploreName: explore.name,
                      message: error.message,
                  }))
                : [],
        );
        return { explores, successfulExplores, validationErrors };
    }

    private static getSemanticExplore(
        explore: Explore,
        generated: SemanticGenerationOutput,
    ): SemanticLayerExplore {
        const dimensions = Object.entries(explore.tables).flatMap(
            ([tableName, table]) =>
                Object.values(table.dimensions).map<SemanticLayerDimension>(
                    (dimension) => ({
                        fieldId: `${dimension.table}_${dimension.name.replaceAll('.', '__')}`,
                        name: dimension.name,
                        label: dimension.label,
                        type: dimension.type,
                        source: generated.fieldSources[tableName]?.dimensions[
                            dimension.name
                        ] ?? {
                            table: tableName,
                            column: dimension.name,
                        },
                        hidden: dimension.hidden,
                    }),
                ),
        );
        const metrics = Object.entries(explore.tables).flatMap(
            ([tableName, table]) =>
                Object.values(table.metrics).map<SemanticLayerMetric>(
                    (metric) => ({
                        fieldId: `${metric.table}_${metric.name.replaceAll('.', '__')}`,
                        name: metric.name,
                        label: metric.label,
                        type: metric.type,
                        source: generated.fieldSources[tableName]?.metrics[
                            metric.name
                        ] ?? {
                            table: tableName,
                            column: metric.name,
                        },
                        hidden: metric.hidden,
                    }),
                ),
        );
        return {
            name: explore.name,
            label: explore.label,
            baseTable: explore.baseTable,
            metrics,
            dimensions,
            joins: explore.joinedTables.map((join) => ({
                table: join.table,
                sqlOn: join.sqlOn,
                relationship: join.relationship ?? null,
            })),
        };
    }

    async runGenerationJob(
        user: SessionUser,
        payload: OnboardingSemanticPayload,
    ): Promise<void> {
        let activeStep: JobStepType | null = null;
        const cleanup: { disconnect: (() => Promise<void>) | null } = {
            disconnect: null,
        };
        await this.jobModel.update(payload.jobUuid, {
            jobStatus: JobStatusType.RUNNING,
        });
        const runStep = async <T>(
            step: JobStepType,
            callback: () => Promise<T>,
        ): Promise<T> => {
            activeStep = step;
            await this.jobModel.startJobStep(payload.jobUuid, step);
            try {
                const result = await callback();
                await this.jobModel.updateJobStep(
                    payload.jobUuid,
                    JobStepStatusType.DONE,
                    step,
                );
                activeStep = null;
                return result;
            } catch (error) {
                await this.jobModel.updateJobStep(
                    payload.jobUuid,
                    JobStepStatusType.ERROR,
                    step,
                    getErrorMessage(error),
                );
                activeStep = null;
                throw error;
            }
        };

        try {
            await this.assertCanManageSemanticLayer(
                user,
                payload.projectUuid,
                true,
            );
            const { generated, warehouseClient } = await runStep(
                JobStepType.ONBOARDING_SEMANTIC_GENERATING_EXPLORES,
                async () => {
                    const profile = await this.getCompletedProfile(
                        payload.projectUuid,
                    );
                    const connection =
                        await this.projectService.getWarehouseClientForUser(
                            user,
                            payload.projectUuid,
                        );
                    cleanup.disconnect = () =>
                        connection.sshTunnel.disconnect();
                    return {
                        generated: this.semanticGenerator(profile, {
                            targetDatabase:
                                connection.warehouseClient.getAdapterType(),
                            fieldQuoteChar:
                                connection.warehouseClient.getFieldQuoteChar(),
                            startOfWeek:
                                connection.warehouseClient.getStartOfWeek(),
                        }),
                        warehouseClient: connection.warehouseClient,
                    };
                },
            );
            const compiled = await runStep(
                JobStepType.ONBOARDING_SEMANTIC_COMPILING_VALIDATING,
                async () => {
                    const result = SemanticGenerationService.compileGeneration(
                        generated,
                        warehouseClient,
                    );
                    if (result.successfulExplores.length === 0) {
                        throw new ParameterError(
                            result.validationErrors[0]?.message ??
                                'No explores could be generated from the warehouse profile',
                        );
                    }
                    return result;
                },
            );
            await runStep(JobStepType.ONBOARDING_SEMANTIC_SAVING, async () => {
                const previousSemanticLayer =
                    await this.onboardingProjectStateModel.find(
                        payload.projectUuid,
                        OnboardingStepType.SEMANTIC_LAYER,
                    );
                const previousSemanticLayerResult =
                    SemanticGenerationService.getStoredSemanticLayerResult(
                        previousSemanticLayer?.result,
                    );
                const previousExploreNames =
                    previousSemanticLayerResult?.explores.map(
                        (explore) => explore.name,
                    ) ?? [];
                if (previousExploreNames.length > 0) {
                    await this.projectModel.deleteCachedExploresByName(
                        payload.projectUuid,
                        previousExploreNames,
                    );
                }
                return this.projectModel.saveExploresToCache(
                    payload.projectUuid,
                    compiled.explores,
                );
            });
            const result: SemanticLayerResult = {
                primaryExploreName: compiled.successfulExplores[0].name,
                explores: compiled.successfulExplores.map((explore) =>
                    SemanticGenerationService.getSemanticExplore(
                        explore,
                        generated,
                    ),
                ),
                skippedTableCount: generated.skippedTableCount,
                validationErrors: compiled.validationErrors,
                generatedAt: new Date().toISOString(),
            };
            await this.onboardingProjectStateModel.upsert(
                payload.projectUuid,
                OnboardingStepType.SEMANTIC_LAYER,
                OnboardingStepStatus.COMPLETED,
                result,
            );
            await this.jobModel.update(payload.jobUuid, {
                jobStatus: JobStatusType.DONE,
            });
        } catch (error) {
            const errorMessage = getErrorMessage(error);
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
            await this.onboardingProjectStateModel.upsert(
                payload.projectUuid,
                OnboardingStepType.SEMANTIC_LAYER,
                OnboardingStepStatus.ERROR,
                { error: errorMessage },
            );
            throw error;
        } finally {
            if (cleanup.disconnect) await cleanup.disconnect();
        }
    }

    async updateField(
        user: SessionUser,
        projectUuid: string,
        request: UpdateSemanticLayerFieldRequest,
    ): Promise<SemanticLayerResult> {
        await this.assertCanManageSemanticLayer(user, projectUuid, false);
        const semanticLayer = await this.onboardingProjectStateModel.find(
            projectUuid,
            OnboardingStepType.SEMANTIC_LAYER,
        );
        if (
            !semanticLayer ||
            semanticLayer.status !== OnboardingStepStatus.COMPLETED ||
            semanticLayer.result === null
        ) {
            throw new NotFoundError(
                'No completed semantic layer exists for this project',
            );
        }
        const updates = {
            ...(request.label !== null ? { label: request.label } : {}),
            ...(request.hidden !== null ? { hidden: request.hidden } : {}),
        };
        if (Object.keys(updates).length === 0) {
            throw new ParameterError('No field updates were provided');
        }
        const updatedExplore = await this.projectModel.updateCachedExploreField(
            projectUuid,
            request.exploreName,
            request.fieldType,
            request.fieldName,
            updates,
        );
        const collectionName =
            request.fieldType === 'dimension' ? 'dimensions' : 'metrics';
        const updatedFields = Object.entries(updatedExplore.tables).flatMap(
            ([tableName, table]) =>
                Object.entries(table[collectionName])
                    .filter(
                        ([key]) =>
                            key === request.fieldName ||
                            `${tableName}_${key}` === request.fieldName,
                    )
                    .map(([key, field]) => ({ tableName, key, field })),
        );
        const updatedField = updatedFields[0];
        const currentResult = semanticLayer.result as SemanticLayerResult;
        const result: SemanticLayerResult = {
            ...currentResult,
            explores: currentResult.explores.map((explore) => {
                if (explore.name !== request.exploreName || !updatedField) {
                    return explore;
                }
                return {
                    ...explore,
                    [collectionName]: explore[collectionName].map((field) =>
                        field.name === updatedField.key &&
                        field.source.table === updatedField.tableName
                            ? {
                                  ...field,
                                  label: updatedField.field.label,
                                  hidden: updatedField.field.hidden,
                              }
                            : field,
                    ),
                };
            }),
        };
        await this.onboardingProjectStateModel.upsert(
            projectUuid,
            OnboardingStepType.SEMANTIC_LAYER,
            OnboardingStepStatus.COMPLETED,
            result,
        );
        return result;
    }
}
