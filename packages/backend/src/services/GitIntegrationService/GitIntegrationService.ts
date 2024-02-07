import {
    GitIntegrationConfiguration,
    PullRequestCreated,
    SessionUser,
} from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';

type Dependencies = {
    lightdashConfig: LightdashConfig;
};

export class GitIntegrationService {
    private readonly lightdashConfig: LightdashConfig;

    constructor({ lightdashConfig }: Dependencies) {
        this.lightdashConfig = lightdashConfig;
    }

    async getConfiguration(
        user: SessionUser,
        projectUuid: string,
    ): Promise<GitIntegrationConfiguration> {
        // to remove
        console.log(this.lightdashConfig);
        // TODO: check if git integration is enabled
        const configuration = {
            enabled: true,
        };
        return configuration;
    }

    async createPullRequestForChartFields(
        user: SessionUser,
        projectUuid: string,
        chartUuid: string,
    ): Promise<PullRequestCreated> {
        // check user permissions, only editors and above?
        // get chart -> get custom metrics
        // get yml from github
        // call util function findAndUpdateModelNodes()
        // update yml
        // create PR

        // to remove
        console.log(this.lightdashConfig);

        const results = {
            prTitle: '',
            prUrl: '',
        };
        return results;
    }
}
