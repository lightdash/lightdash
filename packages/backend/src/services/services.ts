import {
    dashboardModel,
    inviteLinkModel,
    onboardingModel,
    organizationModel,
    projectModel,
    sessionModel,
    userModel,
} from '../models/models';
import { DashboardService } from './DashboardService/DashboardService';
import { OrganizationService } from './OrganizationService';
import { ProjectService } from './ProjectService/ProjectService';
import { SavedChartsService } from './SavedChartsService/SavedChartsService';
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
    onboardingModel,
});

export const projectService = new ProjectService({
    projectModel,
    onboardingModel,
});

export const dashboardService = new DashboardService({
    dashboardModel,
});

export const savedChartsService = new SavedChartsService({
    projectModel,
});
