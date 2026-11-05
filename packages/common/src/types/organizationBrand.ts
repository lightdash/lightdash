/**
 * Brand profile fetched from the Brandfetch Brand API and stored on the
 * organization. https://docs.brandfetch.com/reference/brand-api
 */
export type OrganizationBrandLogo = {
    /**
     * Brandfetch logo type, e.g. 'logo', 'symbol', 'icon', 'other'
     */
    type: string;
    /**
     * Colour of the artwork itself: 'light' is a light/white logo (for dark
     * backgrounds), 'dark' is a dark logo (for light backgrounds).
     */
    theme: string | null;
    url: string;
    /**
     * File format, e.g. 'svg', 'png', 'jpeg'
     */
    format: string | null;
};

export type OrganizationBrandColor = {
    hex: string;
    /**
     * Brandfetch color type, e.g. 'accent', 'brand', 'dark', 'light'
     */
    type: string;
    brightness: number | null;
};

export type OrganizationBrandFont = {
    name: string;
    /**
     * Brandfetch font type, e.g. 'title' or 'body'
     */
    type: string;
    origin: string | null;
};

export type OrganizationBrand = {
    /**
     * @format uuid
     */
    organizationUuid: string;
    /**
     * Domain the brand was fetched for, e.g. 'acme.com'
     */
    domain: string;
    name: string | null;
    description: string | null;
    logos: OrganizationBrandLogo[];
    colors: OrganizationBrandColor[];
    fonts: OrganizationBrandFont[];
    updatedAt: Date;
};

export type UpdateOrganizationBrandRequest = {
    /**
     * Company domain or website URL, e.g. 'acme.com'
     */
    domain: string;
};

/**
 * The editable brand payload persisted when the user saves their brand
 * appearance. Unlike a fetch, this does not call Brandfetch — it stores the
 * values exactly as edited in the settings form.
 */
export type SaveOrganizationBrandRequest = {
    domain: string;
    name: string | null;
    description: string | null;
    logos: OrganizationBrandLogo[];
    colors: OrganizationBrandColor[];
    fonts: OrganizationBrandFont[];
};

export type ApiOrganizationBrandResponse = {
    status: 'ok';
    results: OrganizationBrand | null;
};

export const MAX_ORGANIZATION_BRAND_LOGO_BYTES = 512 * 1024;

export type OrganizationBrandLogoUpload = {
    url: string;
    format: 'png' | 'jpeg' | 'webp' | 'gif' | 'svg';
};

export type ApiOrganizationBrandLogoUploadResponse = {
    status: 'ok';
    results: OrganizationBrandLogoUpload;
};

export const isSquareBrandLogo = (width: number, height: number): boolean =>
    width > 0 &&
    height > 0 &&
    Math.abs(width - height) <= Math.max(width, height) * 0.01;

export type InstanceBrand = {
    logoUrl: string | null;
    name: string | null;
};

const BRAND_LOGO_TYPE_PRIORITY = ['symbol', 'icon', 'logo'];

const rankIndex = (values: string[], value: string | null) => {
    const index = value === null ? -1 : values.indexOf(value);
    return index === -1 ? values.length : index;
};

export const rankBrandLogos = (
    logos: OrganizationBrandLogo[],
): OrganizationBrandLogo[] => {
    const primary = logos.filter(
        (logo) => logo.theme === 'dark' || logo.theme === null,
    );
    return [...(primary.length > 0 ? primary : logos)].sort(
        (a, b) =>
            rankIndex(BRAND_LOGO_TYPE_PRIORITY, a.type) -
                rankIndex(BRAND_LOGO_TYPE_PRIORITY, b.type) ||
            rankIndex(['svg'], a.format) - rankIndex(['svg'], b.format),
    );
};

export const pickBrandLogo = (
    logos: OrganizationBrandLogo[],
): OrganizationBrandLogo | null => rankBrandLogos(logos)[0] ?? null;
