import { subject } from '@casl/ability';
import {
    ForbiddenError,
    NotFoundError,
    type SessionUser,
    type SpotlightTableConfig,
} from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import type { SpotlightTableConfigModel } from '../../models/SpotlightTableConfigModel';
import { BaseService } from '../BaseService';

export type SpotlightArguments = {
    lightdashConfig: LightdashConfig;
    spotlightTableConfigModel: SpotlightTableConfigModel;
    projectModel: ProjectModel;
};

export class SpotlightService extends BaseService {
    lightdashConfig: LightdashConfig;

    spotlightTableConfigModel: SpotlightTableConfigModel;

    projectModel: ProjectModel;

    constructor({
        lightdashConfig,
        spotlightTableConfigModel,
        projectModel,
    }: SpotlightArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.spotlightTableConfigModel = spotlightTableConfigModel;
        this.projectModel = projectModel;
    }

    async createSpotlightTableConfig(
        user: SessionUser,
        projectUuid: string,
        tableConfig: Pick<SpotlightTableConfig, 'columnConfig'>,
    ): Promise<void> {
        const projectSummary = await this.projectModel.getSummary(projectUuid);
        if (
            user.ability.cannot(
                'manage',
                subject('SpotlightTableConfig', {
                    organizationUuid: projectSummary.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.spotlightTableConfigModel.createSpotlightTableConfig(
            projectUuid,
            tableConfig,
        );
    }

    async getSpotlightTableConfig(
        user: SessionUser,
        projectUuid: string,
    ): Promise<SpotlightTableConfig> {
        const projectSummary = await this.projectModel.getSummary(projectUuid);
        if (
            user.ability.cannot(
                'view',
                subject('SpotlightTableConfig', {
                    organizationUuid: projectSummary.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const tableConfig =
            await this.spotlightTableConfigModel.getSpotlightTableConfig(
                projectUuid,
            );

        if (!tableConfig) {
            throw new NotFoundError(
                `Table config not found for project ${projectUuid}`,
            );
        }

        return tableConfig;
    }

    async resetSpotlightTableConfig(
        user: SessionUser,
        projectUuid: string,
    ): Promise<void> {
        const projectSummary = await this.projectModel.getSummary(projectUuid);
        if (
            user.ability.cannot(
                'manage',
                subject('SpotlightTableConfig', {
                    organizationUuid: projectSummary.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.spotlightTableConfigModel.deleteSpotlightTableConfig(
            projectUuid,
        );
    }
}
