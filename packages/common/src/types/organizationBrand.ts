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
     * Theme the asset is designed for, e.g. 'light' or 'dark'
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

export type ApiOrganizationBrandResponse = {
    status: 'ok';
    results: OrganizationBrand | null;
};
