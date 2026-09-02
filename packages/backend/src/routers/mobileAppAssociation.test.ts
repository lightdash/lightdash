import { type Request, type Response } from 'express';
import { type MobileAppAssociationConfig } from '../config/parseConfig';
import {
    buildAndroidAssetLinks,
    buildAppleAppSiteAssociation,
    createAndroidAssetLinksHandler,
    createAppleAppSiteAssociationHandler,
} from './mobileAppAssociation';

const config: MobileAppAssociationConfig = {
    appleTeamId: 'AF5SF5H727',
    appleBundleId: 'com.lightdash.mobile',
    androidPackageName: 'com.lightdash.mobile',
    androidCertificateFingerprints: [],
};

const createResponse = () => {
    const response = {
        type: vi.fn(() => response),
        set: vi.fn(() => response),
        send: vi.fn((body: unknown) => response),
        redirect: vi.fn(() => response),
        status: vi.fn(() => response),
    };
    return response;
};

const invoke = (
    handler: (req: Request, res: Response) => void,
    request: Partial<Request> = {},
) => {
    const response = createResponse();
    handler(request as Request, response as unknown as Response);
    return response;
};

const sentBody = (response: ReturnType<typeof createResponse>) =>
    JSON.parse(String(response.send.mock.calls[0][0]));

describe('buildAppleAppSiteAssociation', () => {
    it('claims the team-prefixed app id', () => {
        expect(
            buildAppleAppSiteAssociation(config).applinks.details[0].appIDs,
        ).toEqual(['AF5SF5H727.com.lightdash.mobile']);
    });

    it('claims only the paths the app routes', () => {
        expect(
            buildAppleAppSiteAssociation(config).applinks.details[0].components,
        ).toEqual([
            { '/': '/projects/*/saved/*' },
            { '/': '/projects/*/dashboards/*' },
            { '/': '/projects/*/dashboards/*/view' },
            { '/': '/projects/*/spaces/*' },
            { '/': '/projects/*/ai-agents/*/threads/*' },
        ]);
    });
});

describe('buildAndroidAssetLinks', () => {
    it('returns an empty relation list when no fingerprint is configured', () => {
        expect(buildAndroidAssetLinks(config)).toEqual([]);
    });

    it('delegates every url to the package for each configured fingerprint', () => {
        expect(
            buildAndroidAssetLinks({
                ...config,
                androidCertificateFingerprints: ['AA:BB', 'CC:DD'],
            }),
        ).toEqual([
            {
                relation: ['delegate_permission/common.handle_all_urls'],
                target: {
                    namespace: 'android_app',
                    package_name: 'com.lightdash.mobile',
                    sha256_cert_fingerprints: ['AA:BB', 'CC:DD'],
                },
            },
        ]);
    });
});

describe('createAppleAppSiteAssociationHandler', () => {
    it('sends json without a redirect', () => {
        const response = invoke(createAppleAppSiteAssociationHandler(config));

        expect(response.type).toHaveBeenCalledWith('application/json');
        expect(response.redirect).not.toHaveBeenCalled();
        expect(response.status).not.toHaveBeenCalled();
        expect(sentBody(response)).toEqual(
            buildAppleAppSiteAssociation(config),
        );
    });

    it('serves the same document to an unauthenticated request', () => {
        const handler = createAppleAppSiteAssociationHandler(config);

        expect(sentBody(invoke(handler, { user: undefined }))).toEqual(
            sentBody(
                invoke(handler, {
                    user: { userUuid: 'a-user' },
                } as Partial<Request>),
            ),
        );
    });

    it('marks the document cacheable', () => {
        expect(
            invoke(createAppleAppSiteAssociationHandler(config)).set,
        ).toHaveBeenCalledWith('Cache-Control', 'public, max-age=3600');
    });
});

describe('createAndroidAssetLinksHandler', () => {
    it('sends json without a redirect', () => {
        const response = invoke(
            createAndroidAssetLinksHandler({
                ...config,
                androidCertificateFingerprints: ['AA:BB'],
            }),
        );

        expect(response.type).toHaveBeenCalledWith('application/json');
        expect(response.redirect).not.toHaveBeenCalled();
        expect(sentBody(response)).toEqual([
            {
                relation: ['delegate_permission/common.handle_all_urls'],
                target: {
                    namespace: 'android_app',
                    package_name: 'com.lightdash.mobile',
                    sha256_cert_fingerprints: ['AA:BB'],
                },
            },
        ]);
    });

    it('sends an empty json array when no fingerprint is configured', () => {
        expect(
            sentBody(invoke(createAndroidAssetLinksHandler(config))),
        ).toEqual([]);
    });
});
