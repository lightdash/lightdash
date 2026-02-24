import { subject } from '@casl/ability';
import {
    DeploySessionStatus,
    Explore,
    ExploreError,
    ForbiddenError,
    NotFoundError,
    SessionUser,
} from '@lightdash/common';
import { DeploySessionModel } from '../models/DeploySessionModel';
import { ProjectModel } from '../models/ProjectModel/ProjectModel';
import { SchedulerClient } from '../scheduler/SchedulerClient';
import { BaseService } from './BaseService';

type ProjectServiceInterface = {
    saveExploresToCacheAndIndexCatalog: (
        userUuid: string,
        projectUuid: string,
        explores: (Explore | ExploreError)[],
        compilationSource: 'cli_deploy' | 'refresh_dbt' | 'create_project',
        jobUuid?: string | null,
        requestMethod?: string | null,
    ) => Promise<string>;
};

type DeployServiceArguments = {
    deploySessionModel: DeploySessionModel;
    projectModel: ProjectModel;
    projectService: ProjectServiceInterface;
    schedulerClient: SchedulerClient;
};

export class DeployService extends BaseService {
    private readonly deploySessionModel: DeploySessionModel;

    private readonly projectModel: ProjectModel;

    private readonly projectService: ProjectServiceInterface;

    private readonly schedulerClient: SchedulerClient;

    constructor(args: DeployServiceArguments) {
        super({ serviceName: 'DeployService' });
        this.deploySessionModel = args.deploySessionModel;
        this.projectModel = args.projectModel;
        this.projectService = args.projectService;
        this.schedulerClient = args.schedulerClient;
    }

    async startDeploySession(
        user: SessionUser,
        projectUuid: string,
    ): Promise<{ deploySessionUuid: string }> {
        // Check permissions - same as setExplores in original ProjectService
        const project =
            await this.projectModel.getWithSensitiveFields(projectUuid);
        if (
            user.ability.cannot(
                'update',
                subject('Project', {
                    projectUuid,
                    organizationUuid: project.organizationUuid,
                    type: project.type,
                    createdByUserUuid: project.createdByUserUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                `User does not have permission to update project`,
            );
        }

        // Create a new deploy session
        const sessionUuid = await this.deploySessionModel.createSession(
            projectUuid,
            user.userUuid,
        );

        this.logger.info(
            `Started deploy session ${sessionUuid} for project ${projectUuid}`,
        );

        return {
            deploySessionUuid: sessionUuid,
        };
    }

    async addDeployBatch(
        user: SessionUser,
        projectUuid: string,
        sessionUuid: string,
        explores: (Explore | ExploreError)[],
        batchNumber: number,
    ): Promise<{ batchNumber: number; exploreCount: number }> {
        try {
            const session =
                await this.deploySessionModel.getSession(sessionUuid);

            // Validate ownership
            if (session.projectUuid !== projectUuid) {
                throw new ForbiddenError(
                    `Deploy session does not belong to this project`,
                );
            }

            if (session.userUuid !== user.userUuid) {
                throw new ForbiddenError(
                    `Deploy session does not belong to this user`,
                );
            }

            if (session.status !== DeploySessionStatus.UPLOADING) {
                throw new ForbiddenError(
                    `Deploy session is not in uploading state`,
                );
            }

            // Add explores to the staging table
            await this.deploySessionModel.addBatch(
                sessionUuid,
                projectUuid,
                explores,
                batchNumber,
            );

            this.logger.info(
                `Added batch ${batchNumber} with ${explores.length} explores to session ${sessionUuid}`,
            );

            return {
                batchNumber,
                exploreCount: explores.length,
            };
        } catch (error) {
            // Mark session as failed if any error occurs
            this.logger.error(
                `Failed to add batch ${batchNumber} to deploy session ${sessionUuid}: ${error}`,
            );

            try {
                await this.deploySessionModel.updateStatus(
                    sessionUuid,
                    DeploySessionStatus.FAILED,
                );
            } catch (updateError) {
                this.logger.error(
                    `Failed to update session status to FAILED for session ${sessionUuid}: ${updateError}`,
                );
            }

            throw error;
        }
    }

    async finalizeDeploy(
        user: SessionUser,
        projectUuid: string,
        sessionUuid: string,
    ): Promise<{ exploreCount: number; status: DeploySessionStatus }> {
        const session = await this.deploySessionModel.getSession(sessionUuid);

        // Validate ownership
        if (session.projectUuid !== projectUuid) {
            throw new ForbiddenError(
                `Deploy session does not belong to this project`,
            );
        }

        if (session.userUuid !== user.userUuid) {
            throw new ForbiddenError(
                `Deploy session does not belong to this user`,
            );
        }

        if (session.status !== DeploySessionStatus.UPLOADING) {
            throw new ForbiddenError(
                `Deploy session is not in uploading state`,
            );
        }

        try {
            // Update status to finalizing
            await this.deploySessionModel.updateStatus(
                sessionUuid,
                DeploySessionStatus.FINALIZING,
            );

            // Get all explores from the session
            const explores =
                await this.deploySessionModel.getAllExplores(sessionUuid);

            this.logger.info(
                `Finalizing deploy session ${sessionUuid} with ${explores.length} explores`,
            );

            // Use the existing saveExploresToCache method from ProjectService
            // This ensures we maintain the same validation and caching logic
            await this.projectService.saveExploresToCacheAndIndexCatalog(
                user.userUuid,
                projectUuid,
                explores,
                'cli_deploy',
                null,
                'cli',
            );

            // Schedule validation (same as in original finalizeDeploy)
            const project =
                await this.projectModel.getWithSensitiveFields(projectUuid);
            await this.schedulerClient.generateValidation({
                userUuid: user.userUuid,
                projectUuid,
                context: 'cli',
                organizationUuid: project.organizationUuid,
            });

            // Mark as completed
            await this.deploySessionModel.updateStatus(
                sessionUuid,
                DeploySessionStatus.COMPLETED,
            );

            // Cleanup session data
            await this.deploySessionModel.deleteSession(sessionUuid);

            return {
                exploreCount: explores.length,
                status: DeploySessionStatus.COMPLETED,
            };
        } catch (error) {
            // Mark as failed on error
            await this.deploySessionModel.updateStatus(
                sessionUuid,
                DeploySessionStatus.FAILED,
            );
            throw error;
        }
    }

    async cleanupOldSessions(): Promise<void> {
        const deletedCount =
            await this.deploySessionModel.cleanupOldSessions(60); // Clean up sessions older than 1 hour
        if (deletedCount > 0) {
            this.logger.info(
                `Cleaned up ${deletedCount} orphaned deploy sessions`,
            );
        }
    }
}
