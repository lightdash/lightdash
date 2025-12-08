import {
    HealthState,
    LightdashInstallType,
    LightdashMode,
    type ReleasesTimeline,
    SessionUser,
    UnexpectedDatabaseError,
} from '@lightdash/common';
import { createHmac } from 'crypto';
import type { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { getDockerHubVersion } from '../../clients/DockerHub/DockerHub';
import { getReleasesAroundVersion } from '../../clients/github/GithubReleases';
import { LightdashConfig } from '../../config/parseConfig';
import { MigrationModel } from '../../models/MigrationModel/MigrationModel';
import { OrganizationModel } from '../../models/OrganizationModel';
import { VERSION } from '../../version';
import { BaseService } from '../BaseService';

type HealthServiceArguments = {
    lightdashConfig: LightdashConfig;
    organizationModel: OrganizationModel;
    migrationModel: MigrationModel;
    analytics: LightdashAnalytics;
};

export class HealthService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly organizationModel: OrganizationModel;

    private readonly migrationModel: MigrationModel;

    private readonly analytics: LightdashAnalytics;

    constructor({
        organizationModel,
        migrationModel,
        lightdashConfig,
        analytics,
    }: HealthServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.organizationModel = organizationModel;
        this.migrationModel = migrationModel;
        this.analytics = analytics;
    }

    private isEnterpriseEnabled(): boolean {
        return this.lightdashConfig.license.licenseKey !== undefined;
    }

    async getHealthState(user: SessionUser | undefined): Promise<HealthState> {
        const isAuthenticated: boolean = !!user?.userUuid;

        const { status: migrationStatus, currentVersion } =
            await this.migrationModel.getMigrationStatus();

        if (migrationStatus < 0) {
            throw new UnexpectedDatabaseError(
                'Database has not been migrated yet',
                { currentVersion },
            );
        } else if (migrationStatus > 0) {
            console.warn(
                `There are more DB migrations than defined in the code (you are running old code against a newer DB). Current version: ${currentVersion}`,
            );
        } // else migrationStatus === 0 (all migrations are up to date)

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
            query: {
                csvCellsLimit: this.lightdashConfig.query.csvCellsLimit,
                maxLimit: this.lightdashConfig.query.maxLimit,
                maxPageSize: this.lightdashConfig.query.maxPageSize,
                defaultLimit: this.lightdashConfig.query.defaultLimit,
            },
            pivotTable: this.lightdashConfig.pivotTable,
            hasSlack: this.hasSlackConfig(),
            slack: {
                multiAgentChannelEnabled:
                    this.lightdashConfig.slack?.multiAgentChannelEnabled ??
                    false,
            },
            hasGithub: process.env.GITHUB_PRIVATE_KEY !== undefined,
            hasGitlab:
                this.lightdashConfig.gitlab.clientId !== undefined &&
                this.lightdashConfig.gitlab.clientSecret !== undefined,
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
                    enableGCloudADC:
                        this.lightdashConfig.auth.google.enableGCloudADC,
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
                pat: {
                    maxExpirationTimeInDays:
                        this.lightdashConfig.auth.pat.maxExpirationTimeInDays,
                },
                snowflake: {
                    enabled:
                        !!this.lightdashConfig.auth.snowflake.clientId &&
                        this.isEnterpriseEnabled(),
                },
                databricks: {
                    enabled: !!this.lightdashConfig.auth.databricks.clientId,
                },
            },
            hasEmailClient: !!this.lightdashConfig.smtp,
            hasHeadlessBrowser:
                this.lightdashConfig.headlessBrowser?.host !== undefined,
            hasExtendedUsageAnalytics:
                this.lightdashConfig.extendedUsageAnalytics.enabled,
            hasCacheAutocompleResults:
                this.lightdashConfig.results.autocompleteEnabled,
            appearance: {
                overrideColorPalette:
                    this.lightdashConfig.appearance.overrideColorPalette,
                overrideColorPaletteName: this.lightdashConfig.appearance
                    .overrideColorPaletteName
                    ? this.lightdashConfig.appearance.overrideColorPaletteName
                    : undefined,
            },
            hasMicrosoftTeams: this.lightdashConfig.microsoftTeams.enabled,
            isServiceAccountEnabled:
                this.lightdashConfig.serviceAccount.enabled,
            isOrganizationWarehouseCredentialsEnabled:
                this.lightdashConfig.organizationWarehouseCredentials.enabled,
            isCustomRolesEnabled:
                this.isEnterpriseEnabled() &&
                this.lightdashConfig.customRoles.enabled,
            embedding: {
                enabled:
                    this.isEnterpriseEnabled() &&
                    this.lightdashConfig.embedding.enabled,
                events: this.isEnterpriseEnabled()
                    ? this.lightdashConfig.embedding.events
                    : undefined,
            },
            ai: {
                analyticsProjectUuid:
                    this.lightdashConfig.ai.analyticsProjectUuid,
                analyticsDashboardUuid:
                    this.lightdashConfig.ai.analyticsDashboardUuid,
            },
            echarts6: {
                enabled: this.lightdashConfig.echarts6.enabled,
            },
        };
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

    /**
     * Gets the releases timeline centered around the current version.
     * @param count Number of releases to return (default 15)
     * @param cursor Optional cursor (release version tag) for pagination
     * @param direction Direction to paginate:
     *   'before' fetches older releases (published before cursor),
     *   'after' fetches newer releases (published after cursor)
     */
    async getReleasesTimeline(
        count?: number,
        cursor?: string,
        direction?: 'before' | 'after',
    ): Promise<ReleasesTimeline> {
        const effectiveCount = count ?? 15;
        const effectiveDirection = direction ?? 'before';
        this.analytics.track({
            event: 'releases_timeline.viewed',
            anonymousId: 'anonymous',
            properties: {
                currentVersion: VERSION,
                count: effectiveCount,
                hasCursor: !!cursor,
                direction: effectiveDirection,
            },
        });

        const result = await getReleasesAroundVersion(
            VERSION,
            effectiveCount,
            cursor,
            effectiveDirection,
        );

        return {
            currentVersion: VERSION,
            currentVersionFound: result.currentVersionFound,
            releases: result.releases,
            hasPrevious: result.hasPrevious,
            hasNext: result.hasNext,
            previousCursor: result.previousCursor,
            nextCursor: result.nextCursor,
        };
    }
}
