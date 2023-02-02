import { S3Service } from '../clients/Aws/s3';
import EmailClient from '../clients/EmailClient/EmailClient';
import { SlackClient } from '../clients/Slack/SlackClient';
import { lightdashConfig } from '../config/lightdashConfig';
import {
    analyticsModel,
    dashboardModel,
    emailModel,
    inviteLinkModel,
    jobModel,
    onboardingModel,
    openIdIdentityModel,
    organizationMemberProfileModel,
    organizationModel,
    passwordResetLinkModel,
    personalAccessTokenModel,
    pinnedListModel,
    projectModel,
    savedChartModel,
    schedulerModel,
    searchModel,
    sessionModel,
    shareModel,
    slackAuthenticationModel,
    spaceModel,
    userModel,
} from '../models/models';
import { AnalyticsService } from './AnalyticsService/AnalyticsService';
import { DashboardService } from './DashboardService/DashboardService';
import { EncryptionService } from './EncryptionService/EncryptionService';
import { HealthService } from './HealthService/HealthService';
import { OrganizationService } from './OrganizationService/OrganizationService';
import { PersonalAccessTokenService } from './PersonalAccessTokenService';
import { ProjectService } from './ProjectService/ProjectService';
import { SavedChartService } from './SavedChartsService/SavedChartService';
import { SchedulerService } from './SchedulerService/SchedulerService';
import { SearchService } from './SearchService/SearchService';
import { ShareService } from './ShareService/ShareService';
import { SpaceService } from './SpaceService/SpaceService';
import { UnfurlService } from './UnfurlService/UnfurlService';
import { UserService } from './UserService';

const emailClient = new EmailClient({ lightdashConfig });
const encryptionService = new EncryptionService({ lightdashConfig });

export const userService = new UserService({
    inviteLinkModel,
    userModel,
    sessionModel,
    emailModel,
    openIdIdentityModel,
    passwordResetLinkModel,
    emailClient,
    organizationMemberProfileModel,
    organizationModel,
    personalAccessTokenModel,
});
export const organizationService = new OrganizationService({
    organizationModel,
    projectModel,
    onboardingModel,
    inviteLinkModel,
    organizationMemberProfileModel,
    userModel,
});

export const projectService = new ProjectService({
    projectModel,
    onboardingModel,
    savedChartModel,
    jobModel,
    emailClient,
    spaceModel,
});

export const shareService = new ShareService({
    lightdashConfig,
    shareModel,
});

export const healthService = new HealthService({
    organizationModel,
    lightdashConfig,
});

export const dashboardService = new DashboardService({
    dashboardModel,
    spaceModel,
    analyticsModel,
    pinnedListModel,
    schedulerModel,
});

export const savedChartsService = new SavedChartService({
    projectModel,
    savedChartModel,
    spaceModel,
    analyticsModel,
    pinnedListModel,
    schedulerModel,
});

export const personalAccessTokenService = new PersonalAccessTokenService({
    personalAccessTokenModel,
});

export const spaceService = new SpaceService({
    projectModel,
    spaceModel,
});

export const searchService = new SearchService({
    projectModel,
    searchModel,
    spaceModel,
});

export const s3Service = new S3Service({
    lightdashConfig,
});

export const unfurlService = new UnfurlService({
    lightdashConfig,
    dashboardModel,
    savedChartModel,
    spaceModel,
    shareModel,
    encryptionService,
    s3Service,
});

export const analyticsService = new AnalyticsService({
    analyticsModel,
});

export const schedulerService = new SchedulerService({
    lightdashConfig,
    schedulerModel,
    savedChartModel,
    dashboardModel,
});

export const slackClient = new SlackClient({
    slackAuthenticationModel,
    lightdashConfig,
});
