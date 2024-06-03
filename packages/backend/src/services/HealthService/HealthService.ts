import {
    FeatureFlags,
    HealthState,
    LightdashInstallType,
    LightdashMode,
    SessionUser,
    UnexpectedDatabaseError,
} from '@lightdash/common';
import { createHmac } from 'crypto';
import { getDockerHubVersion } from '../../clients/DockerHub/DockerHub';
import { LightdashConfig } from '../../config/parseConfig';
import { MigrationModel } from '../../models/MigrationModel/MigrationModel';
import { OrganizationModel } from '../../models/OrganizationModel';
import { isFeatureFlagEnabled } from '../../postHog';
import { VERSION } from '../../version';
import { BaseService } from '../BaseService';

type HealthServiceArguments = {
    lightdashConfig: LightdashConfig;
    organizationModel: OrganizationModel;
    migrationModel: MigrationModel;
};

export class HealthService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly organizationModel: OrganizationModel;

    private readonly migrationModel: MigrationModel;

    constructor({
        organizationModel,
        migrationModel,
        lightdashConfig,
    }: HealthServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.organizationModel = organizationModel;
        this.migrationModel = migrationModel;
    }

    async getHealthState(user: SessionUser | undefined): Promise<HealthState> {
        const isAuthenticated: boolean = !!user?.userUuid;

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
            sentry: {
                frontend: this.lightdashConfig.sentry.frontend,
                environment: this.lightdashConfig.sentry.environment,
                release: this.lightdashConfig.sentry.release,
                tracesSampleRate: this.lightdashConfig.sentry.tracesSampleRate,
                profilesSampleRate:
                    this.lightdashConfig.sentry.profilesSampleRate,
            },
            intercom: this.lightdashConfig.intercom,
            pylon: {
                appId: this.lightdashConfig.pylon.appId,
                verificationHash:
                    this.lightdashConfig.pylon.identityVerificationSecret &&
                    user?.email
                        ? createHmac(
                              'sha256',
                              this.lightdashConfig.pylon
                                  .identityVerificationSecret,
                          )
                              .update(user?.email)
                              .digest('hex')
                        : undefined,
            },
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
            hasGroups: await this.hasGroups(user),
            hasExtendedUsageAnalytics:
                this.lightdashConfig.extendedUsageAnalytics.enabled,
        };
    }

    private async hasGroups(user: SessionUser | undefined): Promise<boolean> {
        return (
            this.lightdashConfig.groups.enabled ||
            (user
                ? await isFeatureFlagEnabled(FeatureFlags.UserGroupsEnabled, {
                      userUuid: user.userUuid,
                      organizationUuid: user.organizationUuid,
                  })
                : false)
        );
    }

    private hasSlackConfig(): boolean {
        return (
            this.lightdashConfig.slack?.clientId !== undefined &&
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
