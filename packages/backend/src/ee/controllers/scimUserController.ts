import {
    ScimErrorPayload,
    ScimListResponse,
    ScimUpsertUser,
    ScimUser,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Patch,
    Path,
    Post,
    Put,
    Query,
    Request,
    Response,
    Route,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { ScimPatch } from 'scim-patch';
import { BaseController } from '../../controllers/baseController';
import { isScimAuthenticated } from '../authentication';
import { ScimService } from '../services/ScimService/ScimService';

@Route('/api/v1/scim/v2/Users')
@Hidden()
@Tags('SCIM')
export class ScimUserController extends BaseController {
    /**
     * Get a list of users within an organization
     * @param req express request
     * @param filter Filter to apply to the user list (optional)
     */
    @Middlewares([isScimAuthenticated])
    @Get('/')
    @OperationId('GetScimUsers')
    @Response<ScimListResponse<ScimUser>>('200', 'Success')
    async getScimUsers(
        @Request() req: express.Request,
        @Query() filter?: string,
        @Query() startIndex?: number,
        @Query() count?: number,
        // SEE: https://bookstack.soffid.com/books/scim/page/scim-query-syntax for syntax
    ): Promise<ScimListResponse<ScimUser>> {
        const organizationUuid = req.serviceAccount?.organizationUuid as string;
        const users = await this.getScimService().listUsers({
            organizationUuid,
            filter,
            startIndex,
            itemsPerPage: count,
        });
        return users;
    }

    /**
     * Get a SCIM user by ID
     * @param req express request
     * @param userUuid Lightdash user UUID - this is used as a unique identifier for SCIM
     */
    @Middlewares([isScimAuthenticated])
    @Get('/{userUuid}')
    @OperationId('GetScimUser')
    @Response<ScimUser>('200', 'Success')
    @Response<ScimErrorPayload>('404', 'Not found')
    async getScimUser(
        @Request() req: express.Request,
        @Path() userUuid: string,
    ): Promise<ScimUser> {
        const organizationUuid = req.serviceAccount?.organizationUuid as string;
        const user = await this.getScimService().getUser({
            organizationUuid,
            userUuid,
        });
        return user;
    }

    /**
     * Create a new user
     * @param req express request
     * @param body User to create
     */
    @Middlewares([isScimAuthenticated])
    @Post('/')
    @OperationId('CreateScimUser')
    @Response<ScimUser>('201', 'Created')
    @Response<ScimErrorPayload>('400', 'Bad request')
    @Response<ScimErrorPayload>('409', 'Conflict')
    async createScimUser(
        @Request() req: express.Request,
        @Body() body: ScimUpsertUser,
    ): Promise<ScimUser> {
        const organizationUuid = req.serviceAccount?.organizationUuid as string;
        const user = await this.getScimService().createUser({
            organizationUuid,
            user: body,
        });
        this.setStatus(201);
        return user;
    }

    /**
     * Update a user by ID (SCIM PUT)
     * @param req express request
     * @param userUuid UUID of the user to update
     * @param body Updated user data
     */
    @Middlewares([isScimAuthenticated])
    @Put('/{userUuid}')
    @OperationId('UpdateScimUser')
    @Response<ScimUser>('200', 'Success')
    @Response<ScimErrorPayload>('404', 'Not found')
    @Response<ScimErrorPayload>('400', 'Bad request')
    async updateScimUser(
        @Request() req: express.Request,
        @Path() userUuid: string,
        @Body() body: ScimUpsertUser,
    ): Promise<ScimUser> {
        const organizationUuid = req.serviceAccount?.organizationUuid as string;
        const user = await this.getScimService().updateUser({
            organizationUuid,
            userUuid,
            user: body,
        });
        return user;
    }

    /**
     * Patch a user by ID (SCIM PATCH)
     * @param req express request
     * @param userUuid UUID of the user to patch
     * @param body Patch operations to apply
     */
    @Middlewares([isScimAuthenticated])
    @Patch('/{userUuid}')
    @OperationId('PatchScimUser')
    @Response<ScimUser>('200', 'Success')
    @Response<ScimErrorPayload>('404', 'Not found')
    @Response<ScimErrorPayload>('400', 'Bad request')
    async patchScimUser(
        @Request() req: express.Request,
        @Path() userUuid: string,
        @Body() body: ScimPatch,
    ): Promise<ScimUser> {
        const organizationUuid = req.serviceAccount?.organizationUuid as string;
        const user = await this.getScimService().patchUser({
            organizationUuid,
            userUuid,
            patchOp: body,
        });
        return user;
    }

    /**
     * Delete a user by ID
     * @param req express request
     * @param userUuid UUID of the user to delete
     */
    @Middlewares([isScimAuthenticated])
    @Delete('/{userUuid}')
    @OperationId('DeleteScimUser')
    @Response('204', 'No content')
    @Response<ScimErrorPayload>('404', 'Not found')
    async deleteScimUser(
        @Request() req: express.Request,
        @Path() userUuid: string,
    ): Promise<void> {
        const organizationUuid = req.serviceAccount?.organizationUuid as string;
        await this.getScimService().deleteUser({
            organizationUuid,
            userUuid,
        });
        this.setStatus(204);
    }

    // Convenience method to access the SCIM service
    protected getScimService() {
        return this.services.getScimService<ScimService>();
    }
}
