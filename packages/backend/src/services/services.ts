import database from '../database/database';
import { InviteLinkModel } from '../models/InviteLinkModel';
import { UserService } from './UserService';
import { OrganizationService } from './OrganizationService';
import { OrganizationModel } from '../models/OrganizationModel';

const inviteLinkModel = new InviteLinkModel(database);
const organizationModel = new OrganizationModel(database);

export const userService = new UserService({ inviteLinkModel });
export const organizationService = new OrganizationService({
    organizationModel,
});
