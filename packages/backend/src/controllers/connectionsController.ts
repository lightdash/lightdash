import {
    ApiErrorPayload,
    ApiSuccessEmpty,
    Connection,
    ConnectionType,
} from '@lightdash/common';
import {
    Controller,
    Get,
    Middlewares,
    OperationId,
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
} from './authentication';
import { BaseController } from './baseController';

type ApiSuccess<T> = {
    status: 'ok';
    results: T;
};



const integrations = [
    { name: ConnectionType.SHOPIFY, icon: '/logos/shopify.svg' },
    { name: ConnectionType.GOOGLE_ANALYTICS, icon: '/logos/google-analytics.svg' },
    // { name: ConnectionType.META_ADS, icon: '/logos/meta-ads.svg' },
    // { name: ConnectionType.GOOGLE_ADS, icon: '/logos/google-ads.svg' },
    // { name: ConnectionType.POSTHOG, icon: '/logos/posthog.svg' },
];

const integrationIconMap = integrations.reduce<Record<string, string>>((acc, curr) => {
    acc[curr.name] = curr.icon;
    return acc;
}, {});


@Route('/api/v1/connections')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Connections')
export class ConnectionsController extends BaseController {
    /**
     * Get user connections
     * Returns all connections (Shopify, Google Analytics, etc.) for the current user
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/')
    @OperationId('getConnections')
    @SuccessResponse('200', 'Success')
    async getConnections(
        @Request() req: express.Request,
    ): Promise<ApiSuccess<Connection[]>> {
        const shopService = req.services.getShopService();
        const connections: Connection[] = [];

        // Check Shopify connection
        const shop = await shopService.getShopByUserUuid(req.user!.userUuid);
        connections.push({
            connection_type: ConnectionType.SHOPIFY,
            user_uuid: req.user!.userUuid,
            name: shop ? shop.shop_url : '',
            is_connected: shop && !shop.is_uninstalled && !!shop.access_token ? true : false,
            icon: integrationIconMap[ConnectionType.SHOPIFY],
        });


        // TODO: Add Google Analytics connection check here
        // const googleAnalyticsService = req.services.getGoogleAnalyticsService();
        const gaConnection = false;
        connections.push({
            connection_type: ConnectionType.GOOGLE_ANALYTICS,
            user_uuid: req.user!.userUuid,
            name: '',
            is_connected: false,
            icon: integrationIconMap[ConnectionType.GOOGLE_ANALYTICS],
        });

        this.setStatus(200);
        return {
            status: 'ok',
            results: connections,
        };
    }
}