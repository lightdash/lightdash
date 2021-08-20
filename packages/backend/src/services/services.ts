import database from '../database/database';
import { InviteLinkModel } from '../models/InviteLinkModel';
import { UserService } from './UserService';
import { OrganizationService } from './OrganizationService';
import { OrganizationModel } from '../models/OrganizationModel';
import { UserModel } from '../models/UserModel';
import { SessionModel } from '../models/SessionModel';

const inviteLinkModel = new InviteLinkModel(database);
const organizationModel = new OrganizationModel(database);
const userModel = new UserModel(database);
const sessionModel = new SessionModel(database);

export const userService = new UserService({
    inviteLinkModel,
    userModel,
    sessionModel,
});
export const organizationService = new OrganizationService({
    organizationModel,
    userModel,
});
