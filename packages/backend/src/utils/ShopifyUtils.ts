//import { SHOP_DOMAIN_RE } from '../utils/shopifyUtils'; // define this regex
import { lightdashConfig } from '../config/lightdashConfig';


export const normalizeShopDomain = (raw: string): string => {
    if (!raw) throw new Error('Shop cannot be blank');

    raw = raw.trim().toLowerCase();

    if (raw.startsWith('http://') || raw.startsWith('https://')) {
        raw = new URL(raw).host;
    }

    raw = raw.split('/')[0];

    if (!raw.includes('.myshopify.com')) {
        raw = `${raw}.myshopify.com`;
    }

    // if (!SHOP_DOMAIN_RE.test(raw)) {
    //     throw new Error("That doesn’t look like a valid Shopify shop domain");
    // }

    return raw;
};

export const generateAuthUrl = (shopDomain: string): string => {
    const params = new URLSearchParams({
        client_id: lightdashConfig.auth.shopify.apiKey,
        scope: lightdashConfig.auth.shopify.scopes,
        redirect_uri: lightdashConfig.auth.shopify.redirectUri!,
        state: 'optional-state-token',
    });
    return `https://${shopDomain}/admin/oauth/authorize?${params.toString()}`;
};