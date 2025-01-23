import { subject } from '@casl/ability';
import {
    ForbiddenError,
    NotFoundError,
    type SessionUser,
    type SpotlightTableConfig,
} from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';
import type { SpotlightTableConfigModel } from '../../models/SpotlightTableConfigModel';
import { BaseService } from '../BaseService';

export type SpotlightArguments = {
    lightdashConfig: LightdashConfig;
    spotlightTableConfigModel: SpotlightTableConfigModel;
};

export class SpotlightService extends BaseService {
    lightdashConfig: LightdashConfig;

    spotlightTableConfigModel: SpotlightTableConfigModel;

    constructor({
        lightdashConfig,
        spotlightTableConfigModel,
    }: SpotlightArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.spotlightTableConfigModel = spotlightTableConfigModel;
    }

    async createSpotlightTableConfig(
        user: SessionUser,
        projectUuid: string,
        tableConfig: Pick<SpotlightTableConfig, 'columnConfig'>,
    ): Promise<void> {
        if (
            user.ability.cannot(
                'manage',
                subject('SpotlightTableConfig', {
                    organizationUuid: user.organizationUuid,
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
        if (
            user.ability.cannot(
                'view',
                subject('SpotlightTableConfig', {
                    organizationUuid: user.organizationUuid,
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
        if (
            user.ability.cannot(
                'manage',
                subject('SpotlightTableConfig', {
                    organizationUuid: user.organizationUuid,
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
