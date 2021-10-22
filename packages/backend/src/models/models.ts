import database from '../database/database';
import { InviteLinkModel } from './InviteLinkModel';
import { OrganizationModel } from './OrganizationModel';
import { UserModel } from './UserModel';
import { SessionModel } from './SessionModel';
import { lightdashConfig } from '../config/lightdashConfig';
import { EncryptionService } from '../services/EncryptionService/EncryptionService';
import { ProjectModel } from './ProjectModel';
import { DashboardModel } from './DashboardModel/DashboardModel';

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
