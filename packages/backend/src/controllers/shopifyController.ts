import {
    ApiErrorPayload,
    ApiSuccessEmpty,
    ParameterError,
} from '@lightdash/common';
import {
    Body,
    Controller,
    Get,
    OperationId,
    Post,
    Query,
    Request,
    Response,
    Route,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { BaseController } from './baseController';
import { runShopifyDataIngestion } from '../services/ShopifyDataIngestion';

@Route('/api/v1/auth/shopify')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Shopify')
export class ShopifyAuthController extends BaseController {
    /**
     * Setup Shopify user
     */
    @Post('/setup')
    @OperationId('SetupShopifyUser')
    async shopifySetupUser(
        @Body() body: { shopUrl: string; userUuid: string },
        @Request() req: express.Request,
        @Request() res: express.Response,
    ): Promise<ApiSuccessEmpty> {
        try {
            const { shopUrl, userUuid } = body;
            if (!shopUrl || !userUuid) {
                throw new ParameterError('Missing shopUrl or userUuid');
            }

            const shopService = req.services.getShopService();
            const userService = req.services.getUserService();

            const user = await userService.getSessionByUserUuid(userUuid);
            const shop = await shopService.getByShopUrl(shopUrl);

            if (!shop) {
                throw new ParameterError(`No shop found for URL: ${shopUrl}`);
            }

            await shopService.setupUserForShop(shop, user);
            runShopifyDataIngestion(shopUrl, ['products', 'orders']);

            return { status: 'ok', results: undefined };
        } catch (e: any) {
            throw e;
        }
    }
}
