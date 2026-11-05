import { subject } from '@casl/ability';
import {
    Account,
    assertIsAccountWithOrg,
    ForbiddenError,
    isSquareBrandLogo,
    MAX_ORGANIZATION_BRAND_LOGO_BYTES,
    MissingConfigError,
    NotFoundError,
    OrganizationBrand,
    OrganizationBrandColor,
    OrganizationBrandFont,
    OrganizationBrandLogo,
    OrganizationBrandLogoUpload,
    ParameterError,
    pickBrandLogo,
    RegisteredAccount,
    SaveOrganizationBrandRequest,
    TooManyRequestsError,
    UnexpectedServerError,
} from '@lightdash/common';
import fetch from 'node-fetch';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { LightdashConfig } from '../../config/parseConfig';
import { OrganizationBrandModel } from '../../models/OrganizationBrandModel';
import { prepareBrandLogoImage } from '../../utils/brandLogoImage';
import { BaseService } from '../BaseService';
import type { InstanceBrandService } from '../InstanceBrandService/InstanceBrandService';
import type { LicenseService } from '../LicenseService/LicenseService';

const BRANDFETCH_API_URL = 'https://api.brandfetch.io/v2/brands';

const BRAND_LOGO_FILE_URL_PREFIX = '/api/v1/org/brand/logos/';
const BRAND_LOGO_FILE_URL_PATTERN =
    /^\/api\/v1\/org\/brand\/logos\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

const DEFAULT_FAVICON_URL = '/favicon.ico';

const isAllowedBrandLogoUrl = (url: string): boolean =>
    BRAND_LOGO_FILE_URL_PATTERN.test(url) || /^https?:\/\//i.test(url);

// Subset of the Brandfetch Brand API response we care about
// https://docs.brandfetch.com/reference/brand-api
type BrandfetchBrandResponse = {
    name?: string | null;
    description?: string | null;
    logos?: Array<{
        type?: string | null;
        theme?: string | null;
        formats?: Array<{
            src?: string | null;
            format?: string | null;
        }> | null;
    }> | null;
    colors?: Array<{
        hex?: string | null;
        type?: string | null;
        brightness?: number | null;
    }> | null;
    fonts?: Array<{
        name?: string | null;
        type?: string | null;
        origin?: string | null;
    }> | null;
};

export class OrganizationBrandService extends BaseService {
    constructor(
        private readonly dependencies: {
            lightdashConfig: LightdashConfig;
            organizationBrandModel: Pick<
                OrganizationBrandModel,
                | 'findBrand'
                | 'updateBrand'
                | 'createBrandLogoFile'
                | 'findBrandLogoFile'
                | 'deleteUnusedBrandLogoFiles'
            >;
            instanceBrandService: Pick<
                InstanceBrandService,
                'getInstanceBrand'
            >;
            licenseService: Pick<LicenseService, 'getLicenseStatus'>;
        },
    ) {
        super();
    }

    // Uploaded logos live in a table created by an enterprise-only migration
    private hasBrandLogoStorage(): boolean {
        return !!this.dependencies.lightdashConfig.license.licenseKey;
    }

    // Every org member sees the white-label brand, whatever their role
    async getBrand(account: Account): Promise<OrganizationBrand | null> {
        assertIsAccountWithOrg(account);
        const { organizationUuid } = account.organization;
        const brand =
            await this.dependencies.organizationBrandModel.findBrand(
                organizationUuid,
            );
        return brand ?? null;
    }

    private static normalizeBrandDomain(domain: string): string {
        // Accept full URLs ("https://acme.com/about") or bare domains ("acme.com")
        const withoutProtocol = domain
            .trim()
            .toLowerCase()
            .replace(/^[a-z]+:\/\//, '');
        const hostname = withoutProtocol.split(/[/?#:]/)[0];
        if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9-]+)+$/.test(hostname)) {
            throw new ParameterError(`Invalid domain: ${domain}`);
        }
        return hostname;
    }

    private static mapBrandfetchResponse(
        data: BrandfetchBrandResponse,
    ): Pick<
        OrganizationBrand,
        'name' | 'description' | 'logos' | 'colors' | 'fonts'
    > {
        const logos = (data.logos ?? []).flatMap((logo) =>
            (logo?.formats ?? []).reduce<OrganizationBrandLogo[]>(
                (acc, format) => {
                    if (format?.src) {
                        acc.push({
                            type: logo?.type ?? 'other',
                            theme: logo?.theme ?? null,
                            url: format.src,
                            format: format.format ?? null,
                        });
                    }
                    return acc;
                },
                [],
            ),
        );
        const colors = (data.colors ?? []).reduce<OrganizationBrandColor[]>(
            (acc, color) => {
                if (color?.hex) {
                    acc.push({
                        hex: color.hex,
                        type: color.type ?? 'other',
                        brightness: color.brightness ?? null,
                    });
                }
                return acc;
            },
            [],
        );
        const fonts = (data.fonts ?? []).reduce<OrganizationBrandFont[]>(
            (acc, font) => {
                if (font?.name) {
                    acc.push({
                        name: font.name,
                        type: font.type ?? 'other',
                        origin: font.origin ?? null,
                    });
                }
                return acc;
            },
            [],
        );
        return {
            name: data.name ?? null,
            description: data.description ?? null,
            logos,
            colors,
            fonts,
        };
    }

    /**
     * Fetch a brand profile from Brandfetch for the given domain WITHOUT
     * persisting it. Used to populate the appearance form so the user can
     * review and edit before saving (and revert if they change their mind).
     */
    async fetchBrandFromDomain(
        account: Account,
        domain: string,
    ): Promise<OrganizationBrand> {
        assertIsAccountWithOrg(account);
        const { organizationUuid } = account.organization;
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'update',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const apiKey = this.dependencies.lightdashConfig.brandfetch?.apiKey;
        if (!apiKey) {
            throw new MissingConfigError(
                'Brandfetch is not configured. Set BRANDFETCH_API_KEY to enable fetching brand profiles.',
            );
        }

        const normalizedDomain =
            OrganizationBrandService.normalizeBrandDomain(domain);

        const response = await fetch(
            `${BRANDFETCH_API_URL}/${encodeURIComponent(normalizedDomain)}`,
            {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                },
            },
        );

        if (response.status === 404) {
            throw new NotFoundError(
                `No brand found for domain "${normalizedDomain}"`,
            );
        }
        if (response.status === 429) {
            this.logger.warn('Brandfetch rate limit reached', {
                organizationUuid,
                domain: normalizedDomain,
            });
            throw new TooManyRequestsError(
                'Brand lookup is rate limited right now — try again shortly',
            );
        }
        if (!response.ok) {
            this.logger.error('Brandfetch request failed', {
                organizationUuid,
                domain: normalizedDomain,
                status: response.status,
            });
            throw new UnexpectedServerError(
                `Brandfetch request failed with status ${response.status}`,
            );
        }

        let data: BrandfetchBrandResponse;
        try {
            data = (await response.json()) as BrandfetchBrandResponse;
        } catch {
            throw new UnexpectedServerError(
                'Brandfetch returned an invalid response',
            );
        }

        this.logger.info('Fetched organization brand from Brandfetch', {
            organizationUuid,
            domain: normalizedDomain,
        });

        return {
            organizationUuid,
            domain: normalizedDomain,
            ...OrganizationBrandService.mapBrandfetchResponse(data),
            updatedAt: new Date(),
        };
    }

    /**
     * Persist the brand appearance exactly as edited by the user. Does not call
     * Brandfetch — stores the provided colors, logos, fonts and domain as-is.
     */
    async saveBrand(
        account: Account,
        request: SaveOrganizationBrandRequest,
    ): Promise<OrganizationBrand> {
        assertIsAccountWithOrg(account);
        const { organizationUuid } = account.organization;
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'update',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const normalizedDomain = request.domain.trim()
            ? OrganizationBrandService.normalizeBrandDomain(request.domain)
            : '';
        if (request.logos.some((logo) => !isAllowedBrandLogoUrl(logo.url))) {
            throw new ParameterError(
                'Logo URLs must start with http:// or https://',
            );
        }

        const brand =
            await this.dependencies.organizationBrandModel.updateBrand(
                organizationUuid,
                {
                    domain: normalizedDomain,
                    name: request.name,
                    description: request.description,
                    logos: request.logos,
                    colors: request.colors,
                    fonts: request.fonts,
                },
            );

        if (this.hasBrandLogoStorage()) {
            await this.dependencies.organizationBrandModel.deleteUnusedBrandLogoFiles(
                organizationUuid,
                request.logos.reduce<string[]>((acc, logo) => {
                    const match = logo.url.match(BRAND_LOGO_FILE_URL_PATTERN);
                    return match ? [...acc, match[1].toLowerCase()] : acc;
                }, []),
            );
        }

        this.logger.info('Saved organization brand', {
            organizationUuid,
            domain: normalizedDomain,
        });

        return brand;
    }

    async uploadBrandLogo(
        account: RegisteredAccount,
        input: { body: Readable; contentLength: number },
    ): Promise<OrganizationBrandLogoUpload> {
        assertIsAccountWithOrg(account);
        const { organizationUuid } = account.organization;
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'update',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        if (!this.hasBrandLogoStorage()) {
            throw new ForbiddenError(
                'Uploading a brand logo requires an Enterprise license',
            );
        }
        if (input.contentLength > MAX_ORGANIZATION_BRAND_LOGO_BYTES) {
            throw new ParameterError(
                `Logo must be ${MAX_ORGANIZATION_BRAND_LOGO_BYTES / 1024} KB or smaller`,
            );
        }

        const chunks: Buffer[] = [];
        let total = 0;
        // eslint-disable-next-line no-restricted-syntax
        for await (const chunk of input.body) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            total += buffer.length;
            if (total > MAX_ORGANIZATION_BRAND_LOGO_BYTES) {
                throw new ParameterError(
                    `Logo must be ${MAX_ORGANIZATION_BRAND_LOGO_BYTES / 1024} KB or smaller`,
                );
            }
            chunks.push(buffer);
        }
        const rawBody = Buffer.concat(chunks);

        const { format, contentType, data } = prepareBrandLogoImage(rawBody);
        const { width, height } = await sharp(data)
            .metadata()
            .catch(() => {
                throw new ParameterError('Logo is not a valid image');
            });
        if (!width || !height || !isSquareBrandLogo(width, height)) {
            throw new ParameterError('Logo must have equal width and height');
        }

        const logoFileUuid =
            await this.dependencies.organizationBrandModel.createBrandLogoFile({
                organization_uuid: organizationUuid,
                content_type: contentType,
                data,
                size_bytes: data.length,
                created_by_user_uuid: account.user.userUuid,
            });

        return { url: `${BRAND_LOGO_FILE_URL_PREFIX}${logoFileUuid}`, format };
    }

    async getFaviconUrl(
        account: Account | undefined,
        isEmailVerified: boolean,
    ): Promise<string> {
        const fallback =
            this.dependencies.instanceBrandService.getInstanceBrand()
                ?.logoUrl ?? DEFAULT_FAVICON_URL;
        // Unverified sessions can't load the organization's logo when email is configured
        const isRestrictedSession =
            !!this.dependencies.lightdashConfig.smtp && !isEmailVerified;
        if (
            !account?.isSessionUser() ||
            isRestrictedSession ||
            !this.dependencies.licenseService.getLicenseStatus().valid
        ) {
            return fallback;
        }
        const { organizationUuid } = account.organization;
        if (!organizationUuid) {
            return fallback;
        }
        const brand =
            await this.dependencies.organizationBrandModel.findBrand(
                organizationUuid,
            );
        return (brand ? pickBrandLogo(brand.logos)?.url : null) ?? fallback;
    }

    async getBrandLogo(
        account: Account,
        logoFileUuid: string,
    ): Promise<{ contentType: string; data: Buffer }> {
        assertIsAccountWithOrg(account);
        const { organizationUuid } = account.organization;
        if (!this.hasBrandLogoStorage()) {
            throw new NotFoundError('Brand logo not found');
        }
        const logoFile =
            await this.dependencies.organizationBrandModel.findBrandLogoFile(
                organizationUuid,
                logoFileUuid,
            );
        if (!logoFile) {
            throw new NotFoundError('Brand logo not found');
        }
        return { contentType: logoFile.content_type, data: logoFile.data };
    }
}
