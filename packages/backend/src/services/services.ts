import { emailClient, s3CacheClient, s3Client } from '../clients/clients';
import { lightdashConfig } from '../config/lightdashConfig';
import {
    analyticsModel,
    dashboardModel,
    emailModel,
    groupsModel,
    inviteLinkModel,
    jobModel,
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
    validationModel,
} from '../models/models';
import { AnalyticsService } from './AnalyticsService/AnalyticsService';
import { CsvService } from './CsvService/CsvService';
import { DashboardService } from './DashboardService/DashboardService';
import { EncryptionService } from './EncryptionService/EncryptionService';
import { GdriveService } from './GdriveService/GdriveService';
import { GroupsService } from './GroupService';
import { HealthService } from './HealthService/HealthService';
import { OrganizationService } from './OrganizationService/OrganizationService';
import { PersonalAccessTokenService } from './PersonalAccessTokenService';
import { PinningService } from './PinningService/PinningService';
import { ProjectService } from './ProjectService/ProjectService';
import { SavedChartService } from './SavedChartsService/SavedChartService';
import { SchedulerService } from './SchedulerService/SchedulerService';
import { SearchService } from './SearchService/SearchService';
import { ShareService } from './ShareService/ShareService';
import { SpaceService } from './SpaceService/SpaceService';
import { SshKeyPairService } from './SshKeyPairService';
import { UnfurlService } from './UnfurlService/UnfurlService';
import { UserAttributesService } from './UserAttributesService/UserAttributesService';
import { UserService } from './UserService';
import { ValidationService } from './ValidationService/ValidationService';

const encryptionService = new EncryptionService({ lightdashConfig });

export const userService = new UserService({
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
});
export const organizationService = new OrganizationService({
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
    savedChartModel,
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
    pinnedListModel,
});

export const searchService = new SearchService({
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
});

export const analyticsService = new AnalyticsService({
    analyticsModel,
});

export const schedulerService = new SchedulerService({
    lightdashConfig,
    schedulerModel,
    savedChartModel,
    dashboardModel,
    spaceModel,
});

export const csvService = new CsvService({
    lightdashConfig,
    userModel,
    s3Client,
    projectService,
    dashboardModel,
    savedChartModel,
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
    projectModel,
    savedChartModel,
    validationModel,
    dashboardModel,
    spaceModel,
});

export const groupService = new GroupsService({
    groupsModel,
    projectModel,
});

export const sshKeyPairService = new SshKeyPairService({
    sshKeyPairModel,
});

export const userAttributesService = new UserAttributesService({
    userAttributesModel,
});

export const gdriveService = new GdriveService({
    lightdashConfig,
    userModel,
    projectService,
    dashboardModel,
    savedChartModel,
});
