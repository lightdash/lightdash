import database from '../database/database';
import { InviteLinkModel } from '../models/InviteLinkModel';
import { UserService } from './UserService';
import { OrganizationService } from './OrganizationService';
import { OrganizationModel } from '../models/OrganizationModel';
import { UserModel } from '../models/UserModel';
import { SessionModel } from '../models/SessionModel';
import { ProjectService } from './ProjectService';
import { lightdashConfig } from '../config/lightdashConfig';
import { EncryptionService } from './EncryptionService/EncryptionService';
import { ProjectModel } from '../models/ProjectModel';

export const encryptionService = new EncryptionService({ lightdashConfig });

const inviteLinkModel = new InviteLinkModel(database);
const organizationModel = new OrganizationModel(database);
const userModel = new UserModel(database);
const sessionModel = new SessionModel(database);
const projectModel = new ProjectModel({
    database,
    lightdashConfig,
    encryptionService,
});

export const userService = new UserService({
    inviteLinkModel,
    userModel,
    sessionModel,
});
export const organizationService = new OrganizationService({
    organizationModel,
    userModel,
    projectModel,
});

export const projectService = new ProjectService({
    lightdashConfig,
    projectModel,
});
