import { type MobileAppPlatform } from '@lightdash/common';
import { type Request, type Response } from 'express';
import { type LightdashConfig } from '../config/parseConfig';
import Logger from '../logging/logger';
import { type MobileAppService } from '../services/MobileAppService/MobileAppService';
import { getClientAddress } from '../utils/clientAddress';

export const MOBILE_APP_LANDING_PATH = '/m/app';

export const detectMobileAppPlatform = (
    userAgent: string | undefined,
): MobileAppPlatform | null => {
    if (!userAgent) return null;
    if (/\b(iPhone|iPad|iPod)\b/.test(userAgent)) return 'ios';
    if (/\bAndroid\b/.test(userAgent)) return 'android';
    return null;
};

export const createMobileAppRedirectHandler =
    (
        mobileAppService: Pick<MobileAppService, 'recordScan'>,
        stores: LightdashConfig['mobileAppStores'],
        trustProxy: LightdashConfig['trustProxy'],
    ) =>
    async (req: Request, res: Response): Promise<void> => {
        const platform = detectMobileAppPlatform(req.get('user-agent'));
        if (platform && req.method === 'GET') {
            try {
                await mobileAppService.recordScan({
                    scanId: req.params.scanId,
                    platform,
                    clientAddress: getClientAddress(req, trustProxy),
                });
            } catch (error) {
                Logger.warn('Failed to record a mobile app link scan', {
                    error,
                });
            }
        }

        res.set('Cache-Control', 'no-store');
        res.set('Referrer-Policy', 'no-referrer');
        if (platform === 'ios') {
            res.redirect(302, stores.appStoreUrl);
        } else if (platform === 'android') {
            res.redirect(302, stores.googlePlayUrl);
        } else {
            res.redirect(302, MOBILE_APP_LANDING_PATH);
        }
    };
