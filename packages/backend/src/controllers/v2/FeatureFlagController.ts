import {
    ApiErrorPayload,
    assertRegisteredAccount,
    FeatureFlag,
    isJwtUser,
} from '@lightdash/common';
import {
    Body,
    Delete,
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
import { toSessionUser } from '../../auth/account';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../authentication/middlewares';
import { BaseController } from '../baseController';

@Route('/api/v2/feature-flag')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Feature Flag')
export class FeatureFlagController extends BaseController {
    /**
     * List every known feature flag with its resolved value for the requesting
     * user. Preview environments only.
     * @summary List feature flags
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('List feature flags')
    async listFeatureFlags(@Request() req: express.Request): Promise<{
        status: 'ok';
        results: FeatureFlag[];
    }> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getFeatureFlagService()
                .list(req.account),
        };
    }

    /**
     * Get feature flag
     * @summary Get feature flag
     */
    @SuccessResponse('200', 'Success')
    @Get('/{featureFlagId}')
    @OperationId('Get feature flag')
    async getFeatureFlag(
        @Request() req: express.Request,
        @Path() featureFlagId: string,
    ): Promise<{
        status: 'ok';
        results: FeatureFlag;
    }> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services.getFeatureFlagService().get({
                user:
                    req.account && !isJwtUser(req.account)
                        ? toSessionUser(req.account)
                        : undefined,
                featureFlagId,
            }),
        };
    }

    /**
     * Override a feature flag for the requesting user's organization. Preview
     * environments only — lets QA toggle flags without a redeploy.
     * @summary Set feature flag override
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{featureFlagId}')
    @OperationId('Set feature flag override')
    async setFeatureFlagOverride(
        @Request() req: express.Request,
        @Path() featureFlagId: string,
        @Body() body: { enabled: boolean },
    ): Promise<{
        status: 'ok';
        results: FeatureFlag;
    }> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getFeatureFlagService()
                .setOrganizationOverride({
                    account: req.account,
                    featureFlagId,
                    enabled: body.enabled,
                }),
        };
    }

    /**
     * Remove the organization override for a feature flag, restoring the
     * environment default. Preview environments only.
     * @summary Delete feature flag override
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Delete('/{featureFlagId}')
    @OperationId('Delete feature flag override')
    async deleteFeatureFlagOverride(
        @Request() req: express.Request,
        @Path() featureFlagId: string,
    ): Promise<{
        status: 'ok';
        results: FeatureFlag;
    }> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getFeatureFlagService()
                .deleteOrganizationOverride({
                    account: req.account,
                    featureFlagId,
                }),
        };
    }
}
