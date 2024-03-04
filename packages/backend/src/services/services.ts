import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { emailClient, s3CacheClient, s3Client } from '../clients/clients';
import { lightdashConfig } from '../config/lightdashConfig';
import {
    analyticsModel,
    commentModel,
    dashboardModel,
    downloadFileModel,
    emailModel,
    githubAppInstallationsModel,
    groupsModel,
    inviteLinkModel,
    jobModel,
    notificationsModel,
    onboardingModel,
    openIdIdentityModel,
    organizationAllowedEmailDomainsModel,
    organizationMemberProfileModel,
    organizationModel,
    passwordResetLinkModel,
    personalAccessTokenModel,
    pinnedListModel,
    projectModel,
    resourceViewItemModel,
    savedChartModel,
    schedulerModel,
    searchModel,
    sessionModel,
    shareModel,
    spaceModel,
    sshKeyPairModel,
    userAttributesModel,
    userModel,
    userWarehouseCredentialsModel,
    validationModel,
} from '../models/models';
import { AnalyticsService } from './AnalyticsService/AnalyticsService';
import { CommentService } from './CommentService/CommentService';
import { CsvService } from './CsvService/CsvService';
import { DashboardService } from './DashboardService/DashboardService';
import { DownloadFileService } from './DownloadFileService/DownloadFileService';
import { EncryptionService } from './EncryptionService/EncryptionService';
import { GdriveService } from './GdriveService/GdriveService';
import { GithubAppService } from './GithubAppService/GithubAppService';
import { GitIntegrationService } from './GitIntegrationService/GitIntegrationService';
import { GroupsService } from './GroupService';
import { HealthService } from './HealthService/HealthService';
import { NotificationsService } from './NotificationsService/NotificationsService';
import { OrganizationService } from './OrganizationService/OrganizationService';
import { PersonalAccessTokenService } from './PersonalAccessTokenService';
import { PinningService } from './PinningService/PinningService';
import { ProjectService } from './ProjectService/ProjectService';
import { SavedChartService } from './SavedChartsService/SavedChartService';
import { SchedulerService } from './SchedulerService/SchedulerService';
import { SearchService } from './SearchService/SearchService';
import { ServiceRepository } from './ServiceRepository';
import { ShareService } from './ShareService/ShareService';
import { SpaceService } from './SpaceService/SpaceService';
import { SshKeyPairService } from './SshKeyPairService';
import { UnfurlService } from './UnfurlService/UnfurlService';
import { UserAttributesService } from './UserAttributesService/UserAttributesService';
import { UserService } from './UserService';
import { ValidationService } from './ValidationService/ValidationService';

const analytics = new LightdashAnalytics({
    lightdashConfig,
    writeKey: lightdashConfig.rudder.writeKey || 'notrack',
    dataPlaneUrl: lightdashConfig.rudder.dataPlaneUrl
        ? `${lightdashConfig.rudder.dataPlaneUrl}/v1/batch`
        : 'notrack',
    options: {
        enable:
            lightdashConfig.rudder.writeKey &&
            lightdashConfig.rudder.dataPlaneUrl,
    },
});

const encryptionService = new EncryptionService({ lightdashConfig });

export const userService = new UserService({
    lightdashConfig,
    analytics,
    inviteLinkModel,
    userModel,
    groupsModel,
    sessionModel,
    emailModel,
    openIdIdentityModel,
    passwordResetLinkModel,
    emailClient,
    organizationMemberProfileModel,
    organizationModel,
    personalAccessTokenModel,
    organizationAllowedEmailDomainsModel,
    userWarehouseCredentialsModel,
});
export const organizationService = new OrganizationService({
    lightdashConfig,
    analytics,
    organizationModel,
    projectModel,
    onboardingModel,
    inviteLinkModel,
    organizationMemberProfileModel,
    userModel,
    organizationAllowedEmailDomainsModel,
    groupsModel,
});

export const projectService = new ProjectService({
    lightdashConfig,
    analytics,
    projectModel,
    onboardingModel,
    savedChartModel,
    jobModel,
    emailClient,
    spaceModel,
    sshKeyPairModel,
    userAttributesModel,
    s3CacheClient,
    analyticsModel,
    dashboardModel,
    userWarehouseCredentialsModel,
});

export const shareService = new ShareService({
    lightdashConfig,
    analytics,
    shareModel,
});

export const healthService = new HealthService({
    organizationModel,
    lightdashConfig,
});

export const dashboardService = new DashboardService({
    analytics,
    dashboardModel,
    spaceModel,
    analyticsModel,
    pinnedListModel,
    schedulerModel,
    savedChartModel,
});

export const savedChartsService = new SavedChartService({
    analytics,
    projectModel,
    savedChartModel,
    spaceModel,
    analyticsModel,
    pinnedListModel,
    schedulerModel,
});

export const personalAccessTokenService = new PersonalAccessTokenService({
    analytics,
    personalAccessTokenModel,
});

export const spaceService = new SpaceService({
    analytics,
    projectModel,
    spaceModel,
    pinnedListModel,
});

export const searchService = new SearchService({
    analytics,
    projectModel,
    searchModel,
    spaceModel,
    userAttributesModel,
});

export const unfurlService = new UnfurlService({
    lightdashConfig,
    dashboardModel,
    savedChartModel,
    spaceModel,
    shareModel,
    encryptionService,
    s3Client,
    projectModel,
    downloadFileModel,
});

export const analyticsService = new AnalyticsService({
    analytics,
    analyticsModel,
});

export const schedulerService = new SchedulerService({
    lightdashConfig,
    analytics,
    schedulerModel,
    savedChartModel,
    dashboardModel,
    spaceModel,
});

export const csvService = new CsvService({
    lightdashConfig,
    analytics,
    userModel,
    s3Client,
    projectService,
    dashboardModel,
    savedChartModel,
    downloadFileModel,
});

export const pinningService = new PinningService({
    dashboardModel,
    savedChartModel,
    spaceModel,
    pinnedListModel,
    resourceViewItemModel,
    projectModel,
});

export const validationService = new ValidationService({
    lightdashConfig,
    analytics,
    projectModel,
    savedChartModel,
    validationModel,
    dashboardModel,
    spaceModel,
});

export const groupService = new GroupsService({
    analytics,
    groupsModel,
    projectModel,
});

export const sshKeyPairService = new SshKeyPairService({
    sshKeyPairModel,
});

export const userAttributesService = new UserAttributesService({
    analytics,
    userAttributesModel,
});

export const gdriveService = new GdriveService({
    lightdashConfig,
    userModel,
    projectService,
    dashboardModel,
    savedChartModel,
});

export const downloadFileService = new DownloadFileService({
    lightdashConfig,
    downloadFileModel,
});

export const gitIntegrationService = new GitIntegrationService({
    lightdashConfig,
    savedChartModel,
    projectModel,
    githubAppInstallationsModel,
});

export const githubAppService = new GithubAppService({
    githubAppInstallationsModel,
    userModel,
});

export const commentService = new CommentService({
    analytics,
    dashboardModel,
    spaceModel,
    commentModel,
    notificationsModel,
    userModel,
});

export const notificationsService = new NotificationsService({
    notificationsModel,
});

/**
 * See ./ServiceRepository for how this will work.
 */
export const serviceRepository = new ServiceRepository({
    services: {
        analyticsService,
        commentService,
        csvService,
        dashboardService,
        downloadFileService,
        encryptionService,
        gdriveService,
        githubAppService,
        gitIntegrationService,
        groupService,
        healthService,
        organizationService,
        personalAccessTokenService,
        pinningService,
        projectService,
        schedulerService,
        searchService,
        shareService,
        spaceService,
        sshKeyPairService,
        unfurlService,
        userAttributesService,
        userService,
        validationService,
        notificationService: notificationsService,
        savedChartService: savedChartsService,
    },
});
