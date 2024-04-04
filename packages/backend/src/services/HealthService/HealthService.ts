import {
    HealthState,
    LightdashInstallType,
    LightdashMode,
    UnexpectedDatabaseError,
} from '@lightdash/common';
import { getDockerHubVersion } from '../../clients/DockerHub/DockerHub';
import { LightdashConfig } from '../../config/parseConfig';
import { MigrationModel } from '../../models/MigrationModel/MigrationModel';
import { OrganizationModel } from '../../models/OrganizationModel';
import { VERSION } from '../../version';

type HealthServiceArguments = {
    lightdashConfig: LightdashConfig;
    organizationModel: OrganizationModel;
    migrationModel: MigrationModel;
};

export class HealthService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly organizationModel: OrganizationModel;

    private readonly migrationModel: MigrationModel;

    constructor({
        organizationModel,
        migrationModel,
        lightdashConfig,
    }: HealthServiceArguments) {
        this.lightdashConfig = lightdashConfig;
        this.organizationModel = organizationModel;
        this.migrationModel = migrationModel;
    }

    async getHealthState(isAuthenticated: boolean): Promise<HealthState> {
        const { isComplete, currentVersion } =
            await this.migrationModel.getMigrationStatus();

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
            hasGithub: process.env.GITHUB_PRIVATE_KEY !== undefined,
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
                oidc: {
                    loginPath: this.lightdashConfig.auth.oidc.loginPath,
                    enabled: !!this.lightdashConfig.auth.oidc.clientId,
                },
            },
            hasEmailClient: !!this.lightdashConfig.smtp,
            hasHeadlessBrowser:
                this.lightdashConfig.headlessBrowser?.host !== undefined,
            // TODO: soon to be deleted as we move feature to UI - https://github.com/lightdash/lightdash/issues/6767
            hasDbtSemanticLayer:
                !!process.env.DBT_CLOUD_ENVIRONMENT_ID &&
                !!process.env.DBT_CLOUD_BEARER_TOKEN,
            hasGroups: this.lightdashConfig.groups.enabled,
            hasExtendedUsageAnalytics:
                this.lightdashConfig.extendedUsageAnalytics.enabled,
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
