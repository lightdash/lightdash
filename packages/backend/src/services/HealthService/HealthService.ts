import { HealthState, LightdashInstallType, LightdashMode } from 'common';
import fetch from 'node-fetch';
import { LightdashConfig } from '../../config/parseConfig';
import { getMigrationStatus } from '../../database/database';
import { UnexpectedDatabaseError } from '../../errors';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { UserModel } from '../../models/UserModel';
import { VERSION } from '../../version';

const filterByName = (result: { name: string }): boolean =>
    /[0-9.]+$/.test(result.name);

const sorterByDate = (
    a: { last_updated: string },
    b: { last_updated: string },
): number =>
    Number(new Date(b.last_updated)) - Number(new Date(a.last_updated));

type HealthServiceDependencies = {
    userModel: UserModel;
    projectModel: ProjectModel;
    lightdashConfig: LightdashConfig;
};

export class HealthService {
    private readonly userModel: UserModel;

    private readonly projectModel: ProjectModel;

    private readonly lightdashConfig: LightdashConfig;

    constructor({
        userModel,
        projectModel,
        lightdashConfig,
    }: HealthServiceDependencies) {
        this.userModel = userModel;
        this.projectModel = projectModel;
        this.lightdashConfig = lightdashConfig;
    }

    async getHealthState(isAuthenticated: boolean): Promise<HealthState> {
        const { isComplete, currentVersion } = await getMigrationStatus();

        if (!isComplete) {
            throw new UnexpectedDatabaseError(
                'Database has not been migrated yet',
                { currentVersion },
            );
        }

        let latestVersion: string | undefined;
        try {
            const response = await fetch(
                'https://hub.docker.com/v2/repositories/lightdash/lightdash/tags',
                { method: 'GET' },
            );
            latestVersion = (await response.json()).results
                .filter(filterByName)
                .sort(sorterByDate)[0].name;
        } catch {
            latestVersion = undefined;
        }

        const needsProject = !(await this.projectModel.hasProjects());

        const localDbtEnabled =
            process.env.LIGHTDASH_INSTALL_TYPE !==
                LightdashInstallType.HEROKU &&
            this.lightdashConfig.mode !== LightdashMode.CLOUD_BETA;
        return {
            healthy: true,
            mode: this.lightdashConfig.mode,
            version: VERSION,
            needsSetup: !(await this.userModel.hasUsers()),
            needsProject,
            localDbtEnabled,
            defaultProject: undefined,
            isAuthenticated,
            latest: { version: latestVersion },
            rudder: this.lightdashConfig.rudder,
            sentry: this.lightdashConfig.sentry,
            chatwoot: this.lightdashConfig.chatwoot,
            cohere: this.lightdashConfig.cohere,
            siteUrl: this.lightdashConfig.siteUrl,
            auth: {
                disablePasswordAuthentication:
                    this.lightdashConfig.auth.disablePasswordAuthentication,
                google: {
                    loginPath: this.lightdashConfig.auth.google.loginPath,
                    oauth2ClientId:
                        this.lightdashConfig.auth.google.oauth2ClientId,
                },
            },
            hasEmailClient: !!this.lightdashConfig.smtp,
        };
    }
}
