import {
    NotFoundError,
    type SessionUser,
    type SpotlightTableConfig,
} from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';
import { BaseService } from '../BaseService';
import type { SpotlightTableConfigModel } from '../../models/SpotlightTableConfigModel';

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
        // TODO: permissions check

        await this.spotlightTableConfigModel.createSpotlightTableConfig(
            projectUuid,
            tableConfig,
        );
    }

    async getSpotlightTableConfig(
        user: SessionUser,
        projectUuid: string,
    ): Promise<SpotlightTableConfig> {
        // TODO: permissions check

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
        // TODO: permissions check

        await this.spotlightTableConfigModel.deleteSpotlightTableConfig(
            projectUuid,
        );
    }
}
