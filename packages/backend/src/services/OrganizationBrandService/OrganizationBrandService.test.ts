import { Ability } from '@casl/ability';
import {
    ForbiddenError,
    NotFoundError,
    ParameterError,
    type PossibleAbilities,
} from '@lightdash/common';
import fetch, { Response } from 'node-fetch';
import { Readable } from 'node:stream';
import { buildAccount } from '../../auth/account/account.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { OrganizationBrandModel } from '../../models/OrganizationBrandModel';
import { OrganizationBrandService } from './OrganizationBrandService';

vi.mock('node-fetch', async (importOriginal) => ({
    ...(await importOriginal<typeof import('node-fetch')>()),
    default: vi.fn(),
}));

const organizationBrandModel = {
    findBrand: vi.fn(),
    createBrandLogoFile: vi.fn<OrganizationBrandModel['createBrandLogoFile']>(
        async () => '6f1d0a52-8b0a-4b6a-9a52-3f0a7c1f2d11',
    ),
    findBrandLogoFile: vi.fn(),
    updateBrand: vi.fn<OrganizationBrandModel['updateBrand']>(),
    deleteUnusedBrandLogoFiles: vi.fn<
        OrganizationBrandModel['deleteUnusedBrandLogoFiles']
    >(async () => 0),
};
beforeEach(() => vi.clearAllMocks());
describe('brand logos', () => {
    const buildLicensedService = () =>
        new OrganizationBrandService({
            lightdashConfig: {
                ...lightdashConfigMock,
                license: {
                    ...lightdashConfigMock.license,
                    licenseKey: 'license',
                },
            },
            organizationBrandModel,
        });
    const organizationService = new OrganizationBrandService({
        lightdashConfig: lightdashConfigMock,
        organizationBrandModel,
    });
    const buildAdminAccount = () => {
        const account = buildAccount();
        account.user.ability = new Ability<PossibleAbilities>([
            {
                action: 'manage',
                subject: 'Organization',
                conditions: {
                    organizationUuid: account.organization.organizationUuid,
                },
            },
        ]);
        return account;
    };
    const upload = (service: OrganizationBrandService, body: string) =>
        service.uploadBrandLogo(buildAdminAccount(), {
            body: Readable.from([Buffer.from(body)]),
            contentLength: body.length,
        });

    it('reads branding scoped to the authenticated organization', async () => {
        const account = buildAdminAccount();
        organizationBrandModel.findBrand.mockResolvedValueOnce(null);
        expect(await buildLicensedService().getBrand(account)).toBeNull();
        expect(organizationBrandModel.findBrand).toHaveBeenCalledWith(
            account.organization.organizationUuid,
        );
    });

    it('rejects reading branding without organization access', async () => {
        const account = buildAccount();
        account.user.ability = new Ability<PossibleAbilities>([]);
        await expect(
            buildLicensedService().getBrand(account),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(organizationBrandModel.findBrand).not.toHaveBeenCalled();
    });

    it('fetches a normalized domain without persisting the brand', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(
            new Response(
                JSON.stringify({ name: 'Acme', colors: [{ hex: '#123456' }] }),
                { status: 200 },
            ),
        );
        const service = new OrganizationBrandService({
            lightdashConfig: {
                ...lightdashConfigMock,
                brandfetch: { apiKey: 'test-key' },
            },
            organizationBrandModel,
        });
        const result = await service.fetchBrandFromDomain(
            buildAdminAccount(),
            'https://ACME.com/about',
        );
        expect(result).toMatchObject({
            domain: 'acme.com',
            name: 'Acme',
            colors: [{ hex: '#123456', type: 'other', brightness: null }],
        });
        expect(fetch).toHaveBeenCalledWith(
            'https://api.brandfetch.io/v2/brands/acme.com',
            expect.any(Object),
        );
        expect(organizationBrandModel.updateBrand).not.toHaveBeenCalled();
    });

    it('sanitizes uploaded SVG logos', async () => {
        const result = await upload(
            buildLicensedService(),
            '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><script>alert(1)</script><rect onload="alert(2)" width="32" height="32"/></svg>',
        );

        expect(result).toEqual({
            url: '/api/v1/org/brand/logos/6f1d0a52-8b0a-4b6a-9a52-3f0a7c1f2d11',
            format: 'svg',
        });
        const stored =
            organizationBrandModel.createBrandLogoFile.mock.calls[0][0];
        expect(stored.content_type).toBe('image/svg+xml');
        expect(stored.data.toString('utf8')).not.toMatch(/script|onload/);
    });

    it('rejects files that are not images', async () => {
        await expect(
            upload(buildLicensedService(), 'hello'),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(
            organizationBrandModel.createBrandLogoFile,
        ).not.toHaveBeenCalled();
    });

    it('rejects logos that are not square', async () => {
        await expect(
            upload(
                buildLicensedService(),
                '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="32"><rect width="120" height="32"/></svg>',
            ),
        ).rejects.toThrow('Logo must have equal width and height');
        expect(
            organizationBrandModel.createBrandLogoFile,
        ).not.toHaveBeenCalled();
    });

    it('requires an Enterprise license to upload', async () => {
        await expect(
            upload(organizationService, '<svg></svg>'),
        ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('rejects logo URLs that are not http(s) when saving', async () => {
        await expect(
            organizationService.saveBrand(buildAdminAccount(), {
                domain: 'acme.com',
                name: 'Acme',
                description: null,
                logos: [
                    {
                        type: 'logo',
                        theme: 'light',
                        url: 'data:image/svg+xml,<svg onload="alert(1)"/>',
                        format: null,
                    },
                ],
                colors: [],
                fonts: [],
            }),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(organizationBrandModel.updateBrand).not.toHaveBeenCalled();
    });

    it.each(['', '   '])(
        'saves manual branding without a domain (%j)',
        async (domain) => {
            const account = buildAdminAccount();
            const request = {
                domain,
                name: 'Acme',
                description: null,
                logos: [],
                colors: [],
                fonts: [],
            };
            await organizationService.saveBrand(account, request);
            expect(organizationBrandModel.updateBrand).toHaveBeenCalledWith(
                account.organization.organizationUuid,
                { ...request, domain: '' },
            );
        },
    );

    it('still rejects an invalid non-empty brand domain', async () => {
        await expect(
            organizationService.saveBrand(buildAdminAccount(), {
                domain: 'not a domain',
                name: 'Acme',
                description: null,
                logos: [],
                colors: [],
                fonts: [],
            }),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(organizationBrandModel.updateBrand).not.toHaveBeenCalled();
    });

    it('deletes uploaded logos no longer referenced by the brand', async () => {
        const account = buildAdminAccount();
        await buildLicensedService().saveBrand(account, {
            domain: 'acme.com',
            name: 'Acme',
            description: null,
            logos: [
                {
                    type: 'logo',
                    theme: 'light',
                    url: '/api/v1/org/brand/logos/6F1D0A52-8B0A-4B6A-9A52-3F0A7C1F2D11',
                    format: 'svg',
                },
                {
                    type: 'symbol',
                    theme: 'dark',
                    url: 'https://cdn.acme.com/symbol.png',
                    format: 'png',
                },
            ],
            colors: [],
            fonts: [],
        });

        expect(
            organizationBrandModel.deleteUnusedBrandLogoFiles,
        ).toHaveBeenCalledWith(account.organization.organizationUuid, [
            '6f1d0a52-8b0a-4b6a-9a52-3f0a7c1f2d11',
        ]);
    });

    it('saves the brand without touching logo files when unlicensed', async () => {
        const account = buildAdminAccount();
        await organizationService.saveBrand(account, {
            domain: 'acme.com',
            name: 'Acme',
            description: null,
            logos: [],
            colors: [{ hex: '#123456', type: 'brand', brightness: null }],
            fonts: [],
        });
        expect(organizationBrandModel.updateBrand).toHaveBeenCalledOnce();
        expect(
            organizationBrandModel.deleteUnusedBrandLogoFiles,
        ).not.toHaveBeenCalled();
    });

    it('reports uploaded logos as missing when unlicensed', async () => {
        await expect(
            organizationService.getBrandLogo(
                buildAdminAccount(),
                '6f1d0a52-8b0a-4b6a-9a52-3f0a7c1f2d11',
            ),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(organizationBrandModel.findBrandLogoFile).not.toHaveBeenCalled();
    });
});
