import type { SessionUser, SpotlightTableConfig } from '@lightdash/common';
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
        columnConfig: SpotlightTableConfig['columnConfig'],
    ): Promise<void> {
        // TODO: permissions check

        await this.spotlightTableConfigModel.createSpotlightTableConfig(
            projectUuid,
            columnConfig,
        );
    }

    async getSpotlightTableConfig(
        user: SessionUser,
        projectUuid: string,
    ): Promise<SpotlightTableConfig | undefined> {
        // TODO: permissions check

        return this.spotlightTableConfigModel.getSpotlightTableConfig(
            projectUuid,
        );
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
