// src/lib/customExpressHandlers/shopifyInstallRedirect.ts

import { Request, Response } from 'express';
import { lightdashConfig } from '../config/lightdashConfig';
import { v4 as uuidv4 } from 'uuid';
import { normalizeShopDomain, generateAuthUrl } from '../utils/ShopifyUtils';

export const shopifyInstallRedirect = (req: Request, res: Response): void => {
    try {
        const shop = req.query.shop?.toString();

        if (!shop) {
            res.status(400).send('Missing `shop` query parameter');
            return;
        }

        const shopDomain = normalizeShopDomain(shop);
        const redirectUrl = generateAuthUrl(shopDomain);

        res.redirect(302, redirectUrl);
    } catch (e: any) {
        console.error('Shopify install redirect error:', e);
        res.status(400).send(`Invalid shop parameter: ${e.message}`);
    }
};


export const shopifyAuthCallback = async (req: Request, res: Response) => {
    const { code, shop } = req.query;

    if (!shop || !code) {
        return res.status(400).send('Missing required parameters: shop or code');
    }

    try {
        const normalizedShop = normalizeShopDomain(shop.toString());

        const tokenResponse = await fetch(
            `https://${normalizedShop}/admin/oauth/access_token`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_id: lightdashConfig.auth.shopify.apiKey,
                    client_secret: lightdashConfig.auth.shopify.apiSecret,
                    code,
                }),
            },
        );

        const data = await tokenResponse.json();

        if (!data.access_token) {
            console.error('Failed to get access token:', data);
            return res.status(401).send('OAuth token exchange failed.');
        }

        const shopService = req.services.getShopService();

        await shopService.create({
            shop_uuid: uuidv4(),
            shop_url: normalizedShop,
            access_token: data.access_token,
            user_uuid: null,
            is_first_login: true,
            is_uninstalled: false,
            is_beta: false,
            subscription_id: null,
            subscription_period_start: new Date(),
            subscription_period_end: null,
            name: '',
            domains: null,
        });

        return res.redirect(`/register?shop=${encodeURIComponent(normalizedShop)}`);
    } catch (e: any) {
        console.error('Shopify callback error:', e);
        return res.status(500).send(`Server error: ${e.message}`);
    }
};

