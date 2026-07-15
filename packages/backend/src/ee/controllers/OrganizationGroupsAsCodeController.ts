import {
    ApiErrorPayload,
    ApiGroupAsCodeListResponse,
    ApiGroupAsCodeUpsertResponse,
    GroupAsCode,
} from '@lightdash/common';
import {
    Body,
    Get,
    Middlewares,
    OperationId,
    Path,
    Post,
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

@Route('/api/v2/orgs/{orgUuid}/groups')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Organizations')
export class OrganizationGroupsAsCodeController extends BaseController {
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/code')
    @OperationId('GetOrganizationGroupsAsCode')
    async getGroupsAsCode(
        @Request() req: express.Request,
        @Path() orgUuid: string,
    ): Promise<ApiGroupAsCodeListResponse> {
        const groups = await this.services
            .getGroupService()
            .getGroupsAsCode(req.account!, orgUuid);

        this.setStatus(200);
        return {
            status: 'ok',
            results: { groups },
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/code')
    @OperationId('UpsertOrganizationGroupAsCode')
    async upsertGroupAsCode(
        @Request() req: express.Request,
        @Path() orgUuid: string,
        @Body() body: GroupAsCode,
    ): Promise<ApiGroupAsCodeUpsertResponse> {
        const results = await this.services
            .getGroupService()
            .upsertGroupAsCode(req.account!, orgUuid, body);

        this.setStatus(200);
        return {
            status: 'ok',
            results,
        };
    }
}
