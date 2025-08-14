import { subject } from '@casl/ability';
import {
    ForbiddenError,
    isExploreError,
    KnexPaginateArgs,
    KnexPaginatedData,
    type ProjectParameterSummary,
    type SessionUser,
} from '@lightdash/common';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { LightdashConfig } from '../config/parseConfig';
import type { ProjectModel } from '../models/ProjectModel/ProjectModel';
import type { ProjectParametersModel } from '../models/ProjectParametersModel';
import { BaseService } from './BaseService';

type ProjectParametersServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectParametersModel: ProjectParametersModel;
    projectModel: ProjectModel;
};

export class ProjectParametersService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly projectParametersModel: ProjectParametersModel;

    private readonly projectModel: ProjectModel;

    constructor(args: ProjectParametersServiceArguments) {
        super();
        this.lightdashConfig = args.lightdashConfig;
        this.analytics = args.analytics;
        this.projectParametersModel = args.projectParametersModel;
        this.projectModel = args.projectModel;
    }

    async findProjectParameters(projectUuid: string, names?: string[]) {
        return this.projectParametersModel.find(projectUuid, names);
    }

    async findProjectParametersPaginated(
        user: SessionUser,
        projectUuid: string,
        options?: {
            search?: string;
            sortBy?: 'name' | 'created_at';
            sortOrder?: 'asc' | 'desc';
        },
        paginateArgs?: KnexPaginateArgs,
    ) {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        // Get config-level parameters from the database
        const configParams = await this.projectParametersModel.findPaginated(
            projectUuid,
            options,
            paginateArgs,
        );

        // Get model-level parameters from explores
        const modelParams = await this._getModelLevelParameters(projectUuid);

        // Combine both parameter sources
        const allParameters: ProjectParameterSummary[] = [
            // Config parameters
            ...configParams.data.map((param) => ({
                name: param.name,
                createdAt: param.created_at,
                config: param.config,
                source: 'config' as const,
            })),
            // Model parameters
            ...modelParams,
        ];

        // Apply search filter if provided
        let filteredParameters = allParameters;
        if (options?.search) {
            const searchTerm = options.search.trim().toLowerCase();
            if (searchTerm.length > 0) {
                filteredParameters = allParameters.filter(
                    (param) =>
                        param.name.toLowerCase().includes(searchTerm) ||
                        param.config.label
                            ?.toLowerCase()
                            .includes(searchTerm) ||
                        param.config.description
                            ?.toLowerCase()
                            .includes(searchTerm) ||
                        param.modelName?.toLowerCase().includes(searchTerm),
                );
            }
        }

        // Apply sorting (only by name since created_at is not meaningful for model parameters)
        const sortOrder = options?.sortOrder || 'asc';
        filteredParameters.sort((a, b) => {
            const comparison = a.name.localeCompare(b.name);
            return sortOrder === 'asc' ? comparison : -comparison;
        });

        // Apply pagination manually since we're combining two sources
        const page = paginateArgs?.page || 1;
        const pageSize = paginateArgs?.pageSize || 20;
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedData = filteredParameters.slice(startIndex, endIndex);

        return {
            data: paginatedData,
            pagination: {
                page,
                pageSize,
                totalPageCount: Math.ceil(filteredParameters.length / pageSize),
                totalResults: filteredParameters.length,
            },
        };
    }

    private async _getModelLevelParameters(
        projectUuid: string,
    ): Promise<ProjectParameterSummary[]> {
        try {
            // Get cached explores directly
            const cachedExplores =
                await this.projectModel.findExploresFromCache(projectUuid);

            const modelParameters: ProjectParameterSummary[] = [];

            // Extract parameters from each explore
            Object.values(cachedExplores).forEach((explore) => {
                if (!isExploreError(explore) && explore.parameters) {
                    // Add each parameter from this model
                    Object.entries(explore.parameters).forEach(
                        ([paramName, paramConfig]) => {
                            modelParameters.push({
                                name: paramName,
                                createdAt: new Date(0), // Model parameters don't have a meaningful created date
                                config: paramConfig,
                                source: 'model' as const,
                                modelName: explore.name,
                            });
                        },
                    );
                }
            });

            return modelParameters;
        } catch (error) {
            // If we can't fetch explores, log error and return empty array
            this.logger.error('Error fetching model-level parameters', error);
            return [];
        }
    }
}
