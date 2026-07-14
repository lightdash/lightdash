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
