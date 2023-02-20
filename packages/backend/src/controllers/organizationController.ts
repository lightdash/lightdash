import {
    ApiErrorPayload,
    ApiJobResponse,
    ApiOnboardingStatusResponse,
    ApiOrganization,
    ApiOrganizationMemberProfile,
    ApiOrganizationMemberProfiles,
    ApiOrganizationProjects,
    ApiProjectResponse,
    ApiSuccessEmpty,
    CreateProject,
    LightdashRequestMethodHeader,
    OrganizationMemberProfileUpdate,
    RequestMethod,
    UpdateOrganization,
} from '@lightdash/common';
import { Controller, Delete, Header } from '@tsoa/runtime';
import express from 'express';
import {
    Body,
    Get,
    Middlewares,
    OperationId,
    Patch,
    Path,
    Post,
    Request,
    Response,
    Route,
} from 'tsoa';
import { promisify } from 'util';
import {
    organizationService,
    projectService,
    userService,
} from '../services/services';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from './authentication';

@Route('/api/v1/org')
@Response<ApiErrorPayload>('default', 'Error')
export class OrganizationController extends Controller {
    /**
     * Get the current user's organization
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get()
    @OperationId('getOrganization')
    async getOrganization(
        @Request() req: express.Request,
    ): Promise<ApiOrganization> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await organizationService.get(req.user!),
        };
    }

    /**
     * Update the current user's organization
     * @param req express request
     * @param body the new organization settings
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @Patch()
    @OperationId('updateOrganization')
    async updateOrganization(
        @Request() req: express.Request,
        @Body() body: UpdateOrganization,
    ): Promise<ApiSuccessEmpty> {
        await organizationService.updateOrg(req.user!, body);
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Delete an organization and all users inside that organization
     * @param req express request
     * @param organizationUuid the uuid of the organization to delete
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @Delete('{organizationUuid}')
    @OperationId('deleteOrganization')
    async deleteOrganization(
        @Request() req: express.Request,
        @Path() organizationUuid: string,
    ): Promise<ApiSuccessEmpty> {
        await organizationService.delete(organizationUuid, req.user!);
        await promisify(req.session.destroy)();
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Get all projects for the current user's organization
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/projects')
    @OperationId('getOrganizationProjects')
    async getOrganizationProjects(
        @Request() req: express.Request,
    ): Promise<ApiOrganizationProjects> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await organizationService.getProjects(req.user!),
        };
    }

    /**
     * Create a new project in the current user's organization. Compile the project for the user.
     * @param req express request
     * @param body the project to create
     * @param method the method used to create the project (CLI, CLI_CI, WEB_APP, UNKNOWN)
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Post('/projects/precompiled')
    @OperationId('createPrecompiledProject')
    async createPrecompiledProject(
        @Request() req: express.Request,
        @Body() body: CreateProject,
        @Header(LightdashRequestMethodHeader) method: RequestMethod,
    ): Promise<ApiJobResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await projectService.create(req.user!, body, method),
        };
    }

    /**
     * Creates a new project in the current user's organization. Does not compile the project for the user.
     * @param req express request
     * @param body the project to create
     * @param method the method used to create the project (CLI, CLI_CI, WEB_APP, UNKNOWN)
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Post('/projects')
    @OperationId('createProject')
    async createProject(
        @Request() req: express.Request,
        @Body() body: CreateProject,
        @Header(LightdashRequestMethodHeader) method: RequestMethod,
    ): Promise<ApiProjectResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await projectService.createWithoutCompile(
                req.user!,
                body,
                method,
            ),
        };
    }

    /**
     * Deletes a project from the current user's organization
     * @param req express request
     * @param projectUuid the uuid of the project to delete
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Delete('/projects/{projectUuid}')
    @OperationId('deleteProject')
    async deleteProject(
        @Request() req: express.Request,
        @Path() projectUuid: string,
    ): Promise<ApiSuccessEmpty> {
        await projectService.delete(projectUuid, req.user!);
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Gets all the members of the current user's organization
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/users')
    @OperationId('getOrganizationMembers')
    async getOrganizationMembers(
        @Request() req: express.Request,
    ): Promise<ApiOrganizationMemberProfiles> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await organizationService.getUsers(req.user!),
        };
    }

    /**
     * Updates the membership profile for a user in the current user's organization
     * @param req express request
     * @param userUuid the uuid of the user to update
     * @param body the new membership profile
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @Patch('/users/{userUuid}')
    @OperationId('updateOrganizationMember')
    async updateOrganizationMember(
        @Request() req: express.Request,
        @Path() userUuid: string,
        @Body() body: OrganizationMemberProfileUpdate,
    ): Promise<ApiOrganizationMemberProfile> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await organizationService.updateMember(
                req.user!,
                userUuid,
                body,
            ),
        };
    }

    /**
     * Deletes a user
     * @param req express request
     * @param userUuid the uuid of the user to delete
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @Delete('/user/{userUuid}')
    @OperationId('deleteUser')
    async deleteUser(
        @Request() req: express.Request,
        @Path() userUuid: string,
    ): Promise<ApiSuccessEmpty> {
        await userService.delete(req.user!, userUuid);
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Gets the current user's onboarding status in the organization
     * @param req express request
     */
    @Middlewares([isAuthenticated])
    @Get('/onboardingStatus')
    @OperationId('getOnboardingStatus')
    async getOnboardingStatus(
        @Request() req: express.Request,
    ): Promise<ApiOnboardingStatusResponse> {
        this.setStatus(200);
        const onboarding = await organizationService.getOnboarding(req.user!);
        const results = {
            ranQuery: !!onboarding.ranQueryAt,
        };
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Updates the current user's onboarding status
     * @param req express request
     */
    @Middlewares([isAuthenticated])
    @Post('/onboardingStatus/shownSuccess')
    @OperationId('updateOnboardingStatusShownSuccess')
    async updateOnboardingStatusShownSuccess(
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        await organizationService.setOnboardingSuccessDate(req.user!);
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
