import {
    ApiCreateUserAttributeResponse,
    ApiErrorPayload,
    ApiSuccessEmpty,
    ApiUserAttributesResponse,
    CreateUserAttribute,
    getRequestMethod,
    LightdashRequestMethodHeader,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
    Middlewares,
    OperationId,
    Path,
    Post,
    Put,
    Request,
    Response,
    Route,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/org/attributes')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('User attributes')
export class UserAttributesController extends BaseController {
    /**
     * Get all user attributes
     * @param req
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/')
    @OperationId('getUserAttributes')
    async getUserAttributes(
        @Request() req: express.Request,
    ): Promise<ApiUserAttributesResponse> {
        this.setStatus(200);
        const context = getRequestMethod(
            req.header(LightdashRequestMethodHeader),
        );
        return {
            status: 'ok',
            results: await this.services
                .getUserAttributesService()
                .getAll(req.user!, context),
        };
    }

    /**
     * Creates new user attribute
     * @param body the user attribute to create
     * @param req
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Post('/')
    @OperationId('createUserAttribute')
    async createUserAttribute(
        @Request() req: express.Request,
        @Body() body: CreateUserAttribute,
    ): Promise<ApiCreateUserAttributeResponse> {
        this.setStatus(201);

        return {
            status: 'ok',
            results: await this.services
                .getUserAttributesService()
                .create(req.user!, body),
        };
    }

    /**
     * Updates a user attribute
     * @param userAttributeUuid the UUID for the group to add the user to
     * @param body the user attribute to update
     * @param req
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Put('{userAttributeUuid}')
    @OperationId('updateUserAttribute')
    async updateUserAttribute(
        @Path() userAttributeUuid: string,
        @Request() req: express.Request,
        @Body() body: CreateUserAttribute,
    ): Promise<ApiCreateUserAttributeResponse> {
        this.setStatus(201);

        return {
            status: 'ok',
            results: await this.services
                .getUserAttributesService()
                .update(req.user!, userAttributeUuid, body),
        };
    }

    /**
     * Remove a user attribute
     * @param userAttributeUuid the user attribute UUID to remove
     * @param req
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Delete('{userAttributeUuid}')
    @OperationId('removeUserAttribute')
    async removeUserAttribute(
        @Path() userAttributeUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);

        await this.services
            .getUserAttributesService()
            .delete(req.user!, userAttributeUuid);
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
