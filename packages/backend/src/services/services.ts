import {
    inviteLinkModel,
    userModel,
    sessionModel,
    organizationModel,
    projectModel,
    dashboardModel,
} from '../models/models';
import { UserService } from './UserService';
import { OrganizationService } from './OrganizationService';
import { ProjectService } from './ProjectService/ProjectService';
import { DashboardService } from './DashboardService/DashboardService';

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
