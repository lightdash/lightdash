import { ParseError } from '@lightdash/common';

export type ShopifyAuthConfig = {
    apiKey: string;
    apiSecret: string;
    scopes: string;
    redirectUri: string;
};

export const parseShopifyConfig = (): ShopifyAuthConfig => {
    const apiKey = process.env.SHOPIFY_API_KEY;
    const apiSecret = process.env.SHOPIFY_API_SECRET;
    const scopes = process.env.SHOPIFY_SCOPES || 'read_orders,read_products';
    const redirectUri = process.env.SHOPIFY_REDIRECT_URI;
  //  const redirectFrontend = process.env.SHOPIFY_REDIRECT_FRONTEND;

    if (!apiKey || !apiSecret || !redirectUri ) {
        throw new ParseError('Missing required Shopify config environment variables');
    }

    return {
        apiKey,
        apiSecret,
        scopes,
        redirectUri,
     //   redirectFrontend,
    };
};
