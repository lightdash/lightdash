import {
    ApiErrorPayload,
    ApiUserAsCodeListResponse,
    ApiUserAsCodeUpsertResponse,
    UserAsCode,
} from '@lightdash/common';
import {
    Body,
    Get,
    Middlewares,
    OperationId,
    Path,
    Post,
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';

@Route('/api/v2/orgs/{orgUuid}/users')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Organizations')
export class OrganizationUsersAsCodeController extends BaseController {
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/code')
    @OperationId('GetOrganizationUsersAsCode')
    async getUsersAsCode(
        @Request() req: express.Request,
        @Path() orgUuid: string,
    ): Promise<ApiUserAsCodeListResponse> {
        const users = await this.services
            .getRolesService()
            .getUsersAsCode(req.account!, orgUuid);

        this.setStatus(200);
        return {
            status: 'ok',
            results: { users },
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/code')
    @OperationId('UpsertOrganizationUserAsCode')
    async upsertUserAsCode(
        @Request() req: express.Request,
        @Path() orgUuid: string,
        @Body() body: UserAsCode,
        @Query() sendInvite: boolean = false,
    ): Promise<ApiUserAsCodeUpsertResponse> {
        const results = await this.services
            .getRolesService()
            .upsertUserAsCode(req.account!, orgUuid, body, sendInvite);

        this.setStatus(200);
        return {
            status: 'ok',
            results,
        };
    }
}
