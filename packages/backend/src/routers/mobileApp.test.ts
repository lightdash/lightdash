import { type Request, type Response } from 'express';
import { type Mock } from 'vitest';
import { type MobileAppService } from '../services/MobileAppService/MobileAppService';
import {
    createMobileAppRedirectHandler,
    detectMobileAppPlatform,
} from './mobileApp';

const IPHONE_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA =
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const DESKTOP_UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const SCAN_ID = 'a'.repeat(43);

const stores = {
    appStoreUrl: 'https://apps.example.com/app',
    googlePlayUrl: 'https://play.example.com/app',
};

const invoke = async ({
    userAgent,
    method = 'GET',
    recordScan = vi.fn<MobileAppService['recordScan']>(async () => undefined),
    forwardedFor = '203.0.113.7',
}: {
    userAgent: string | undefined;
    method?: string;
    recordScan?: Mock<MobileAppService['recordScan']>;
    forwardedFor?: string;
}) => {
    const response = {
        set: vi.fn(() => response),
        redirect: vi.fn(() => response),
    };
    const request = {
        method,
        socket: { remoteAddress: '10.0.0.5' },
        params: { scanId: SCAN_ID },
        get: (header: string) => {
            if (header.toLowerCase() === 'user-agent') return userAgent;
            if (header.toLowerCase() === 'x-forwarded-for') return forwardedFor;
            return undefined;
        },
    };
    await createMobileAppRedirectHandler(
        { recordScan },
        stores,
        true,
    )(request as unknown as Request, response as unknown as Response);
    return { response, recordScan };
};

describe('detectMobileAppPlatform', () => {
    it.each([
        [IPHONE_UA, 'ios'],
        [
            'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
            'ios',
        ],
        [ANDROID_UA, 'android'],
        [DESKTOP_UA, null],
        ['curl/8.0', null],
        [undefined, null],
    ])('maps %s to %s', (userAgent, platform) => {
        expect(detectMobileAppPlatform(userAgent)).toBe(platform);
    });
});

describe('createMobileAppRedirectHandler', () => {
    it('records an iPhone scan and redirects to the App Store', async () => {
        const { response, recordScan } = await invoke({ userAgent: IPHONE_UA });
        expect(recordScan).toHaveBeenCalledWith({
            scanId: SCAN_ID,
            platform: 'ios',
            clientAddress: '203.0.113.7',
        });
        expect(response.redirect).toHaveBeenCalledWith(302, stores.appStoreUrl);
    });

    it('records an Android scan and redirects to Google Play', async () => {
        const { response, recordScan } = await invoke({
            userAgent: ANDROID_UA,
        });
        expect(recordScan).toHaveBeenCalledWith(
            expect.objectContaining({ platform: 'android' }),
        );
        expect(response.redirect).toHaveBeenCalledWith(
            302,
            stores.googlePlayUrl,
        );
    });

    it('keys scans on the client behind the proxy, not the proxy', async () => {
        const first = await invoke({
            userAgent: IPHONE_UA,
            forwardedFor: '203.0.113.7',
        });
        const second = await invoke({
            userAgent: IPHONE_UA,
            forwardedFor: '198.51.100.20',
        });
        expect(first.recordScan).toHaveBeenCalledWith(
            expect.objectContaining({ clientAddress: '203.0.113.7' }),
        );
        expect(second.recordScan).toHaveBeenCalledWith(
            expect.objectContaining({ clientAddress: '198.51.100.20' }),
        );
    });

    it('sends other devices to the landing page without recording', async () => {
        const { response, recordScan } = await invoke({
            userAgent: DESKTOP_UA,
        });
        expect(recordScan).not.toHaveBeenCalled();
        expect(response.redirect).toHaveBeenCalledWith(302, '/m/app');
    });

    it('does not record HEAD requests from link previewers', async () => {
        const { response, recordScan } = await invoke({
            userAgent: IPHONE_UA,
            method: 'HEAD',
        });
        expect(recordScan).not.toHaveBeenCalled();
        expect(response.redirect).toHaveBeenCalledWith(302, stores.appStoreUrl);
    });

    it('still redirects when recording fails', async () => {
        const { response } = await invoke({
            userAgent: IPHONE_UA,
            recordScan: vi.fn<MobileAppService['recordScan']>(async () => {
                throw new Error('db down');
            }),
        });
        expect(response.redirect).toHaveBeenCalledWith(302, stores.appStoreUrl);
    });

    it('stops caches and referrers from keeping the scan URL', async () => {
        const { response } = await invoke({ userAgent: IPHONE_UA });
        expect(response.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
        expect(response.set).toHaveBeenCalledWith(
            'Referrer-Policy',
            'no-referrer',
        );
    });
});
