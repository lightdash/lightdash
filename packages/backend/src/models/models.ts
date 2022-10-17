import { lightdashConfig } from '../config/lightdashConfig';
import database from '../database/database';
import { EncryptionService } from '../services/EncryptionService/EncryptionService';
import { DashboardModel } from './DashboardModel/DashboardModel';
import { PersonalAccessTokenModel } from './DashboardModel/PersonalAccessTokenModel';
import { EmailModel } from './EmailModel';
import { InviteLinkModel } from './InviteLinkModel';
import { JobModel } from './JobModel/JobModel';
import { OnboardingModel } from './OnboardingModel/OnboardingModel';
import { OpenIdIdentityModel } from './OpenIdIdentitiesModel';
import { OrganizationMemberProfileModel } from './OrganizationMemberProfileModel';
import { OrganizationModel } from './OrganizationModel';
import { PasswordResetLinkModel } from './PasswordResetLinkModel';
import { ProjectModel } from './ProjectModel/ProjectModel';
import { SavedChartModel } from './SavedChartModel';
import { SearchModel } from './SearchModel';
import { SessionModel } from './SessionModel';
import { ShareModel } from './ShareModel';
import { SpaceModel } from './SpaceModel';
import { UserModel } from './UserModel';

export const encryptionService = new EncryptionService({ lightdashConfig });

export const inviteLinkModel = new InviteLinkModel(database);
export const organizationModel = new OrganizationModel(database);
export const userModel = new UserModel(database);
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
export const savedChartModel = new SavedChartModel({ database });
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
