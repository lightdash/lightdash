import database from '../database/database';
import { InviteLinkModel } from '../models/InviteLinkModel';
import { UserService } from './UserService';

const inviteLinkModel = new InviteLinkModel(database);
export const userService = new UserService({ inviteLinkModel });
