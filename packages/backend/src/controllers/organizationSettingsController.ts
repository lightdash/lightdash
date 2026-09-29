import {
    ApiErrorPayload,
    ApiOrganizationChartTypesSettingResponse,
    ApiOrganizationSettingsResponse,
    assertRegisteredAccount,
    OrganizationChartTypesSetting,
    UpdateOrganizationSettings,
} from '@lightdash/common';
import {
    Body,
    Get,
    Middlewares,
    OperationId,
    Patch,
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

@Route('/api/v1/org/settings')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Organizations')
export class OrganizationSettingsController extends BaseController {
    /** @summary Get organization chart types setting */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/chart-types')
    @OperationId('GetOrganizationChartTypesSetting')
    async getOrganizationChartTypesSetting(
        @Request() req: express.Request,
    ): Promise<ApiOrganizationChartTypesSettingResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getOrganizationSettingsService()
            .getOrganizationChartTypesSetting(req.account);
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /** @summary Update organization chart types setting */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Patch('/chart-types')
    @OperationId('UpdateOrganizationChartTypesSetting')
    async updateOrganizationChartTypesSetting(
        @Request() req: express.Request,
        @Body() body: OrganizationChartTypesSetting,
    ): Promise<ApiOrganizationChartTypesSettingResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getOrganizationSettingsService()
            .updateOrganizationChartTypesSetting(req.account, body);
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Returns the current organization's settings. Defaults are returned when
     * no settings have been saved.
     * @summary Get organization settings
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get()
    @OperationId('GetOrganizationSettings')
    async getOrganizationSettings(
        @Request() req: express.Request,
    ): Promise<ApiOrganizationSettingsResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getOrganizationSettingsService()
            .getOrganizationSettings(req.account);
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Updates the current organization's settings. Only the provided fields
     * are changed.
     * @summary Update organization settings
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Patch()
    @OperationId('UpdateOrganizationSettings')
    async updateOrganizationSettings(
        @Request() req: express.Request,
        @Body() body: UpdateOrganizationSettings,
    ): Promise<ApiOrganizationSettingsResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getOrganizationSettingsService()
            .updateOrganizationSettings(req.account, body);
        this.setStatus(200);
        return { status: 'ok', results };
    }
}
