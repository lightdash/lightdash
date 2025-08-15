import { ParseError } from '@lightdash/common';

export type ShopifyAuthConfig = {
    apiKey: string;
    apiSecret: string;
    scopes: string;
    redirectUri: string;
    oauthStart: string;
    ingestEndpoint: string;
};

export const parseShopifyConfig = (): ShopifyAuthConfig => {
    const siteUrl = process.env.VITE_SITE_URL || '';
    const apiKey = process.env.SHOPIFY_API_KEY || '';
    const apiSecret = process.env.SHOPIFY_API_SECRET || '';
    const scopes = process.env.SHOPIFY_SCOPES || 'read_orders,read_products';
    const redirectUri = `${siteUrl}/api/v1/auth/shopify/callback`;
    const oauthStart = `${siteUrl}/api/v1/auth/shopify/start`;
    const ingestEndpoint = `${siteUrl}/auth/shopify/refresh`;

    if (!apiKey || !apiSecret ) {
        throw new ParseError('Missing required Shopify config environment variables');
    }

    return {
        apiKey,
        apiSecret,
        scopes,
        redirectUri,
        oauthStart,
        ingestEndpoint,
    };
};
