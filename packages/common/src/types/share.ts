/**
 * A ShareUrl maps a short shareable id to a full URL
 * in the Lightdash UI. This allows very long URLs
 * to be represented by short ids.
 */
export type ShareUrl = {
    /**
     * Unique shareable id
     */
    nanoid: string;
    /**
     * The URL path of the full URL
     */
    path: string;
    params: string;
    /**
     * @format uuid
     */
    createdByUserUuid?: string;
    /**
     * @format uuid
     */
    organizationUuid?: string;
    shareUrl?: string;
    url?: string;
    host?: string;
};

/**
 * Contains the detail of a full URL to generate a short URL id
 */
export type CreateShareUrl = Pick<ShareUrl, 'path' | 'params'>;
