import { lightdashConfig } from '../config/lightdashConfig';
import database from '../database/database';
import { EncryptionService } from '../services/EncryptionService/EncryptionService';
import { DashboardModel } from './DashboardModel/DashboardModel';
import { InviteLinkModel } from './InviteLinkModel';
import { OrganizationModel } from './OrganizationModel';
import { ProjectModel } from './ProjectModel/ProjectModel';
import { SessionModel } from './SessionModel';
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
