import {
    ForbiddenError,
    NotFoundError,
    TooManyRequestsError,
    type SessionUser,
} from '@lightdash/common';
import {
    MOBILE_APP_LINK_MINTS_PER_HOUR,
    MOBILE_APP_SCANS_PER_MINUTE,
    MobileAppService,
} from './MobileAppService';

const USER_UUID = '2c1b7c3e-0f1e-4a7b-9d55-6b0c7d1f4a10';
const ORG_UUID = '7a4f1b2c-3d5e-4f60-8a91-b2c3d4e5f607';
const LINK_UUID = '0f9e8d7c-6b5a-4c3d-9e1f-0a1b2c3d4e5f';
const NOW = new Date('2026-11-09T12:00:00.000Z');
const SCAN_ID = 'b'.repeat(43);

const user = {
    userUuid: USER_UUID,
    organizationUuid: ORG_UUID,
} as SessionUser;

const setup = ({
    flagEnabled = true,
    counter = 1,
}: { flagEnabled?: boolean; counter?: number } = {}) => {
    const mobileAppLinkModel = {
        create: vi.fn(async () => ({
            linkUuid: LINK_UUID,
            scanId: SCAN_ID,
            expiresAt: new Date('2026-11-09T12:30:00.000Z'),
        })),
        findForUser: vi.fn(async () => ({
            mobile_app_link_uuid: LINK_UUID,
            scan_id_hash: 'hash',
            user_uuid: USER_UUID,
            organization_uuid: ORG_UUID,
            created_at: NOW,
            expires_at: new Date('2026-11-09T12:30:00.000Z'),
            first_scanned_at: new Date('2026-11-09T12:01:00.000Z'),
            first_scan_platform: 'ios' as const,
            scan_count: 1,
        })),
        recordScan: vi.fn(async () => ({
            linkUuid: LINK_UUID,
            userUuid: USER_UUID,
            organizationUuid: ORG_UUID,
            createdAt: new Date('2026-11-09T11:59:00.000Z'),
            isFirstScan: true,
        })),
        incrementRateCounter: vi.fn(async () => counter),
    };
    const featureFlagModel = {
        get: vi.fn(async () => ({
            id: 'mobile-settings',
            enabled: flagEnabled,
        })),
    };
    const analytics = { track: vi.fn() };
    const service = new MobileAppService({
        mobileAppLinkModel,
        featureFlagModel,
        analytics,
        lightdashConfig: { siteUrl: 'https://app.example.com/' },
        now: () => NOW,
    });
    return { service, mobileAppLinkModel, featureFlagModel, analytics };
};

describe('MobileAppService.createLink', () => {
    it('returns a scan URL on the site host and tracks the link', async () => {
        const { service, analytics } = setup();

        await expect(service.createLink(user)).resolves.toEqual({
            linkUuid: LINK_UUID,
            scanUrl: `https://app.example.com/m/app/${SCAN_ID}`,
            expiresAt: '2026-11-09T12:30:00.000Z',
        });
        expect(analytics.track).toHaveBeenCalledWith({
            userId: USER_UUID,
            event: 'mobile_app_link.created',
            properties: {
                userId: USER_UUID,
                organizationId: ORG_UUID,
                linkUuid: LINK_UUID,
            },
        });
    });

    it('refuses when the flag is off', async () => {
        const { service, mobileAppLinkModel } = setup({ flagEnabled: false });

        await expect(service.createLink(user)).rejects.toThrow(ForbiddenError);
        expect(mobileAppLinkModel.create).not.toHaveBeenCalled();
    });

    it('refuses a user with no organization', async () => {
        const { service } = setup();

        await expect(
            service.createLink({ ...user, organizationUuid: undefined }),
        ).rejects.toThrow(ForbiddenError);
    });

    it('caps mints per user per hour', async () => {
        const { service, mobileAppLinkModel } = setup({
            counter: MOBILE_APP_LINK_MINTS_PER_HOUR + 1,
        });

        await expect(service.createLink(user)).rejects.toThrow(
            TooManyRequestsError,
        );
        expect(mobileAppLinkModel.create).not.toHaveBeenCalled();
        expect(mobileAppLinkModel.incrementRateCounter).toHaveBeenCalledWith(
            expect.objectContaining({
                operation: 'mint',
                windowStartedAt: new Date('2026-11-09T12:00:00.000Z'),
            }),
        );
    });
});

describe('MobileAppService.getLinkStatus', () => {
    it('returns the scan state of the user’s own link', async () => {
        const { service, mobileAppLinkModel } = setup();

        await expect(service.getLinkStatus(user, LINK_UUID)).resolves.toEqual({
            linkUuid: LINK_UUID,
            expiresAt: '2026-11-09T12:30:00.000Z',
            scannedAt: '2026-11-09T12:01:00.000Z',
            scanPlatform: 'ios',
        });
        expect(mobileAppLinkModel.findForUser).toHaveBeenCalledWith(
            LINK_UUID,
            USER_UUID,
        );
    });

    it('returns not found for another user’s link', async () => {
        const { service, mobileAppLinkModel } = setup();
        mobileAppLinkModel.findForUser.mockResolvedValueOnce(
            undefined as never,
        );

        await expect(service.getLinkStatus(user, LINK_UUID)).rejects.toThrow(
            NotFoundError,
        );
    });

    it('returns not found for a malformed uuid without a query', async () => {
        const { service, mobileAppLinkModel } = setup();

        await expect(service.getLinkStatus(user, 'nope')).rejects.toThrow(
            NotFoundError,
        );
        expect(mobileAppLinkModel.findForUser).not.toHaveBeenCalled();
    });

    it('refuses when the flag is off', async () => {
        const { service } = setup({ flagEnabled: false });

        await expect(service.getLinkStatus(user, LINK_UUID)).rejects.toThrow(
            ForbiddenError,
        );
    });
});

describe('MobileAppService.recordScan', () => {
    it('records the scan and tracks the link as opened', async () => {
        const { service, analytics } = setup();

        await service.recordScan({
            scanId: SCAN_ID,
            platform: 'ios',
            clientIp: '203.0.113.7',
        });

        expect(analytics.track).toHaveBeenCalledWith({
            userId: USER_UUID,
            event: 'mobile_app_link.opened',
            properties: {
                userId: USER_UUID,
                organizationId: ORG_UUID,
                linkUuid: LINK_UUID,
                platform: 'ios',
                secondsSinceCreated: 60,
                isFirstScan: true,
            },
        });
    });

    it('skips recording when one IP scans too often', async () => {
        const { service, mobileAppLinkModel, analytics } = setup({
            counter: MOBILE_APP_SCANS_PER_MINUTE + 1,
        });

        await service.recordScan({
            scanId: SCAN_ID,
            platform: 'android',
            clientIp: '203.0.113.7',
        });

        expect(mobileAppLinkModel.recordScan).not.toHaveBeenCalled();
        expect(analytics.track).not.toHaveBeenCalled();
    });

    it('tracks nothing for an unknown or expired scan id', async () => {
        const { service, mobileAppLinkModel, analytics } = setup();
        mobileAppLinkModel.recordScan.mockResolvedValueOnce(null as never);

        await service.recordScan({
            scanId: SCAN_ID,
            platform: 'ios',
            clientIp: '203.0.113.7',
        });

        expect(analytics.track).not.toHaveBeenCalled();
    });
});
