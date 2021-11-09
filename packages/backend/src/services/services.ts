import {
    dashboardModel,
    inviteLinkModel,
    organizationModel,
    projectModel,
    sessionModel,
    userModel,
} from '../models/models';
import { DashboardService } from './DashboardService/DashboardService';
import { OrganizationService } from './OrganizationService';
import { ProjectService } from './ProjectService/ProjectService';
import { UserService } from './UserService';

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
    projectModel,
});

export const dashboardService = new DashboardService({
    dashboardModel,
});
