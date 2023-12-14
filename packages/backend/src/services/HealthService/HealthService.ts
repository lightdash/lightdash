import {
    HealthState,
    LightdashInstallType,
    LightdashMode,
    UnexpectedDatabaseError,
} from '@lightdash/common';
import { getDockerHubVersion } from '../../clients/DockerHub/DockerHub';
import { LightdashConfig } from '../../config/parseConfig';
import { getMigrationStatus } from '../../database/database';
import { OrganizationModel } from '../../models/OrganizationModel';
import { VERSION } from '../../version';

type HealthServiceDependencies = {
    lightdashConfig: LightdashConfig;
    organizationModel: OrganizationModel;
};

export class HealthService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly organizationModel: OrganizationModel;

    constructor({
        organizationModel,
        lightdashConfig,
    }: HealthServiceDependencies) {
        this.lightdashConfig = lightdashConfig;
        this.organizationModel = organizationModel;
    }

    async getHealthState(isAuthenticated: boolean): Promise<HealthState> {
        const { isComplete, currentVersion } = await getMigrationStatus();

        if (!isComplete) {
            throw new UnexpectedDatabaseError(
                'Database has not been migrated yet',
                { currentVersion },
            );
        }

        const requiresOrgRegistration =
            !(await this.organizationModel.hasOrgs());

        const localDbtEnabled =
            process.env.LIGHTDASH_INSTALL_TYPE !==
                LightdashInstallType.HEROKU &&
            this.lightdashConfig.mode !== LightdashMode.CLOUD_BETA;
        return {
            healthy: true,
            mode: this.lightdashConfig.mode,
            version: VERSION,
            localDbtEnabled,
            defaultProject: undefined,
            isAuthenticated,
            requiresOrgRegistration,
            latest: { version: getDockerHubVersion() },
            rudder: this.lightdashConfig.rudder,
            sentry: this.lightdashConfig.sentry,
            intercom: this.lightdashConfig.intercom,
            siteUrl: this.lightdashConfig.siteUrl,
            staticIp: this.lightdashConfig.staticIp,
            posthog: this.lightdashConfig.posthog,
            query: this.lightdashConfig.query,
            pivotTable: this.lightdashConfig.pivotTable,
            customVisualizationsEnabled:
                this.lightdashConfig.customVisualizations &&
                this.lightdashConfig.customVisualizations.enabled,
            hasSlack: this.hasSlackConfig(),
            auth: {
                disablePasswordAuthentication:
                    this.lightdashConfig.auth.disablePasswordAuthentication,
                google: {
                    loginPath: this.lightdashConfig.auth.google.loginPath,
                    oauth2ClientId:
                        this.lightdashConfig.auth.google.oauth2ClientId,
                    googleDriveApiKey:
                        this.lightdashConfig.auth.google.googleDriveApiKey,
                    enabled: this.isGoogleSSOEnabled(),
                },
                okta: {
                    loginPath: this.lightdashConfig.auth.okta.loginPath,
                    enabled: !!this.lightdashConfig.auth.okta.oauth2ClientId,
                },
                oneLogin: {
                    loginPath: this.lightdashConfig.auth.oneLogin.loginPath,
                    enabled:
                        !!this.lightdashConfig.auth.oneLogin.oauth2ClientId,
                },
                azuread: {
                    loginPath: this.lightdashConfig.auth.azuread.loginPath,
                    enabled: !!this.lightdashConfig.auth.azuread.oauth2ClientId,
                },
            },
            hasEmailClient: !!this.lightdashConfig.smtp,
            hasHeadlessBrowser:
                this.lightdashConfig.headlessBrowser?.host !== undefined,
            // TODO: soon to be deleted as we move feature to UI - https://github.com/lightdash/lightdash/issues/6767
            hasDbtSemanticLayer:
                !!process.env.DBT_CLOUD_ENVIRONMENT_ID &&
                !!process.env.DBT_CLOUD_BEARER_TOKEN,
        };
    }

    private hasSlackConfig(): boolean {
        return (
            this.lightdashConfig.slack?.appToken !== undefined &&
            this.lightdashConfig.slack.signingSecret !== undefined
        );
    }

    private isGoogleSSOEnabled(): boolean {
        return (
            this.lightdashConfig.auth.google.oauth2ClientId !== undefined &&
            this.lightdashConfig.auth.google.oauth2ClientSecret !== undefined &&
            this.lightdashConfig.auth.google.enabled
        );
    }
}
