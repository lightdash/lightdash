import { lightdashConfig } from '../config/lightdashConfig';
import database from '../database/database';
import { EncryptionService } from '../services/EncryptionService/EncryptionService';
import { AnalyticsModel } from './AnalyticsModel';
import { CommentModel } from './CommentModel/CommentModel';
import { DashboardModel } from './DashboardModel/DashboardModel';
import { PersonalAccessTokenModel } from './DashboardModel/PersonalAccessTokenModel';
import { DownloadFileModel } from './DownloadFileModel';
import { EmailModel } from './EmailModel';
import { GithubAppInstallationsModel } from './GithubAppInstallations/GithubAppInstallationsModel';
import { GroupsModel } from './GroupsModel';
import { InviteLinkModel } from './InviteLinkModel';
import { JobModel } from './JobModel/JobModel';
import { NotificationsModel } from './NotificationsModel/NotificationsModel';
import { OnboardingModel } from './OnboardingModel/OnboardingModel';
import { OpenIdIdentityModel } from './OpenIdIdentitiesModel';
import { OrganizationAllowedEmailDomainsModel } from './OrganizationAllowedEmailDomainsModel';
import { OrganizationMemberProfileModel } from './OrganizationMemberProfileModel';
import { OrganizationModel } from './OrganizationModel';
import { PasswordResetLinkModel } from './PasswordResetLinkModel';
import { PinnedListModel } from './PinnedListModel';
import { ProjectModel } from './ProjectModel/ProjectModel';
import { ResourceViewItemModel } from './ResourceViewItemModel';
import { SavedChartModel } from './SavedChartModel';
import { SchedulerModel } from './SchedulerModel';
import { SearchModel } from './SearchModel';
import { SessionModel } from './SessionModel';
import { ShareModel } from './ShareModel';
import { SlackAuthenticationModel } from './SlackAuthenticationModel';
import { SpaceModel } from './SpaceModel';
import { SshKeyPairModel } from './SshKeyPairModel';
import { UserAttributesModel } from './UserAttributesModel';
import { UserModel } from './UserModel';
import { UserWarehouseCredentialsModel } from './UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { ValidationModel } from './ValidationModel/ValidationModel';

export const encryptionService = new EncryptionService({ lightdashConfig });

export const inviteLinkModel = new InviteLinkModel({
    database,
    lightdashConfig,
});
export const organizationModel = new OrganizationModel(database);
export const userModel = new UserModel({ database, lightdashConfig });
export const sessionModel = new SessionModel(database);
export const dashboardModel = new DashboardModel({ database });
export const projectModel = new ProjectModel({
    database,
    lightdashConfig,
    encryptionService,
});
export const onboardingModel = new OnboardingModel({ database });
export const emailModel = new EmailModel({ database });
export const openIdIdentityModel = new OpenIdIdentityModel({ database });
export const passwordResetLinkModel = new PasswordResetLinkModel({
    database,
    lightdashConfig,
});
export const organizationMemberProfileModel =
    new OrganizationMemberProfileModel({ database });
export const savedChartModel = new SavedChartModel({
    database,
    lightdashConfig,
});
export const jobModel = new JobModel({ database });
export const personalAccessTokenModel = new PersonalAccessTokenModel({
    database,
});
export const spaceModel = new SpaceModel({
    database,
});
export const searchModel = new SearchModel({
    database,
});

export const shareModel = new ShareModel({
    database,
});

export const slackAuthenticationModel = new SlackAuthenticationModel({
    database,
});

export const analyticsModel = new AnalyticsModel({
    database,
});
export const pinnedListModel = new PinnedListModel({ database });

export const schedulerModel = new SchedulerModel({ database });

export const organizationAllowedEmailDomainsModel =
    new OrganizationAllowedEmailDomainsModel({ database });

export const resourceViewItemModel = new ResourceViewItemModel({
    database,
});
export const validationModel = new ValidationModel({
    database,
});

export const groupsModel = new GroupsModel({ database });

export const sshKeyPairModel = new SshKeyPairModel({
    database,
    encryptionService,
});

export const userAttributesModel = new UserAttributesModel({ database });
export const downloadFileModel = new DownloadFileModel({ database });

export const userWarehouseCredentialsModel = new UserWarehouseCredentialsModel({
    database,
    encryptionService,
});

export const githubAppInstallationsModel = new GithubAppInstallationsModel({
    database,
    encryptionService,
});

export const commentModel = new CommentModel({ database });

export const notificationsModel = new NotificationsModel({ database });
