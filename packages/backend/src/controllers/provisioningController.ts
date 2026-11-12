import {
    ApiErrorPayload,
    type ApiProvisionOrganizationResponse,
    type ProvisionOrganizationRequest,
} from '@lightdash/common';
import {
    Body,
    Hidden,
    OperationId,
    Post,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { BaseController } from './baseController';

const readBearerToken = (req: express.Request): string | null => {
    const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '');
    return match ? match[1] : null;
};

@Route('/api/v1/provisioning')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Provisioning')
@Hidden()
export class ProvisioningController extends BaseController {
    /**
     * Creates an organization and its owner for a trusted workload identity.
     * The caller authenticates with an identity token, not a session or API key.
     * @summary Provision organization
     */
    @SuccessResponse('201', 'Created')
    @Post('/organizations')
    @OperationId('ProvisionOrganization')
    async provisionOrganization(
        @Request() req: express.Request,
        @Body() body: ProvisionOrganizationRequest,
    ): Promise<ApiProvisionOrganizationResponse> {
        const results = await this.services
            .getProvisioningService()
            .provisionOrganization(readBearerToken(req), body);
        this.setStatus(201);
        return { status: 'ok', results };
    }
}
