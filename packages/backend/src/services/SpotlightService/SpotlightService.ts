import { subject } from '@casl/ability';
import {
    ForbiddenError,
    NotFoundError,
    type Account,
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
        account: Account,
        projectUuid: string,
        tableConfig: Pick<SpotlightTableConfig, 'columnConfig'>,
    ): Promise<void> {
        const projectSummary = await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'manage',
                subject('SpotlightTableConfig', {
                    organizationUuid: projectSummary.organizationUuid,
                    projectUuid,
                    metadata: {
                        projectUuid,
                        projectName: projectSummary.name,
                    },
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
        account: Account,
        projectUuid: string,
    ): Promise<SpotlightTableConfig> {
        const projectSummary = await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'view',
                subject('SpotlightTableConfig', {
                    organizationUuid: projectSummary.organizationUuid,
                    projectUuid,
                    metadata: {
                        projectUuid,
                        projectName: projectSummary.name,
                    },
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
        account: Account,
        projectUuid: string,
    ): Promise<void> {
        const projectSummary = await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'manage',
                subject('SpotlightTableConfig', {
                    organizationUuid: projectSummary.organizationUuid,
                    projectUuid,
                    metadata: {
                        projectUuid,
                        projectName: projectSummary.name,
                    },
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
