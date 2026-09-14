import { SessionOptions, Store } from 'express-session';
import { LightdashConfig } from './config/parseConfig';

type SessionRelevantConfig = Pick<
    LightdashConfig,
    | 'lightdashSecrets'
    | 'trustProxy'
    | 'cookiesMaxAgeHours'
    | 'secureCookies'
    | 'cookieSameSite'
>;

export const buildExpressSessionOptions = (
    lightdashConfig: SessionRelevantConfig,
    store: Store,
    port: string | number,
): SessionOptions => ({
    name:
        process.env.NODE_ENV === 'development' &&
        process.env.DEV_SCOPED_COOKIE_NAMES_ENABLED === 'true'
            ? `connect.sid.${port}`
            : 'connect.sid',
    // Active secret signs new cookies; fallbacks keep sessions
    // signed before a secret rotation verifiable until expiry
    secret: [...lightdashConfig.lightdashSecrets.all],
    proxy: lightdashConfig.trustProxy,
    rolling: true,
    cookie: {
        maxAge: (lightdashConfig.cookiesMaxAgeHours || 24) * 60 * 60 * 1000, // in ms
        secure: lightdashConfig.secureCookies,
        httpOnly: true,
        sameSite: lightdashConfig.cookieSameSite,
    },
    resave: false,
    saveUninitialized: false,
    store,
});
