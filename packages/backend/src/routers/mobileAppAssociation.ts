import { type Request, type Response } from 'express';
import { type MobileAppAssociationConfig } from '../config/parseConfig';

export type AppleAppSiteAssociation = {
    applinks: {
        details: Array<{
            appIDs: string[];
            components: Array<{ '/': string }>;
        }>;
    };
};

export type AndroidAssetLinks = Array<{
    relation: string[];
    target: {
        namespace: string;
        package_name: string;
        sha256_cert_fingerprints: string[];
    };
}>;

const UNIVERSAL_LINK_PATHS = [
    '/projects/*/saved/*',
    '/projects/*/dashboards/*',
    '/projects/*/dashboards/*/view',
    '/projects/*/spaces/*',
    '/projects/*/ai-agents/*/threads/*',
];

export const buildAppleAppSiteAssociation = (
    config: MobileAppAssociationConfig,
): AppleAppSiteAssociation => ({
    applinks: {
        details: [
            {
                appIDs: [`${config.appleTeamId}.${config.appleBundleId}`],
                components: UNIVERSAL_LINK_PATHS.map((path) => ({
                    '/': path,
                })),
            },
        ],
    },
});

export const buildAndroidAssetLinks = (
    config: MobileAppAssociationConfig,
): AndroidAssetLinks =>
    config.androidCertificateFingerprints.length === 0
        ? []
        : [
              {
                  relation: ['delegate_permission/common.handle_all_urls'],
                  target: {
                      namespace: 'android_app',
                      package_name: config.androidPackageName,
                      sha256_cert_fingerprints:
                          config.androidCertificateFingerprints,
                  },
              },
          ];

const createStaticJsonHandler = (document: unknown) => {
    const body = JSON.stringify(document);
    return (req: Request, res: Response) => {
        res.type('application/json')
            .set('Cache-Control', 'public, max-age=3600')
            .send(body);
    };
};

export const createAppleAppSiteAssociationHandler = (
    config: MobileAppAssociationConfig,
) => createStaticJsonHandler(buildAppleAppSiteAssociation(config));

export const createAndroidAssetLinksHandler = (
    config: MobileAppAssociationConfig,
) => createStaticJsonHandler(buildAndroidAssetLinks(config));
