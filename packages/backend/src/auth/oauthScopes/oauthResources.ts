import OAuth2Server from '@node-oauth/oauth2-server';
import { validate as isValidUuid } from 'uuid';

export type OAuthResourceBinding = { resource: string | null };

export class InvalidTargetError extends OAuth2Server.OAuthError {
    constructor() {
        super('Requested resource is invalid', {
            code: 400,
            name: 'invalid_target',
        });
    }
}

export const oauthApiResource = (siteUrl: string): string =>
    siteUrl.replace(/\/+$/, '');
export const oauthMcpResource = (siteUrl: string): string =>
    `${oauthApiResource(siteUrl)}/api/v1/mcp`;

export const canonicalOAuthResource = (
    siteUrl: string,
    raw: string,
): string | null => {
    try {
        const url = new URL(raw);
        const api = oauthApiResource(siteUrl);
        const mcp = oauthMcpResource(siteUrl);
        if (
            raw.includes('?') ||
            raw.includes('#') ||
            url.username ||
            url.password
        )
            return null;
        const candidate = raw.replace(/\/$/, '');
        if (candidate === api) return api;
        if (candidate === mcp) return mcp;
        const projectPrefix = `${mcp}/projects/`;
        if (
            candidate.startsWith(projectPrefix) &&
            isValidUuid(candidate.slice(projectPrefix.length))
        )
            return mcp;
        return null;
    } catch {
        return null;
    }
};

export const requestedOAuthResource = (
    siteUrl: string,
    request: {
        body: Record<string, unknown>;
        query: Record<string, unknown> | null;
    },
): string | null => {
    const bodyResource = request.body.resource;
    const queryResource = request.query?.resource;
    if (bodyResource === undefined && queryResource === undefined) return null;
    if (bodyResource !== undefined && queryResource !== undefined)
        throw new InvalidTargetError();
    const raw = bodyResource === undefined ? queryResource : bodyResource;
    if (typeof raw !== 'string') throw new InvalidTargetError();
    const canonical = canonicalOAuthResource(siteUrl, raw);
    if (canonical === null) throw new InvalidTargetError();
    return canonical;
};

export const resolveGrantedOAuthResource = (
    siteUrl: string,
    request: OAuth2Server.Request,
    parentResource: string | null,
): string => {
    const requested = requestedOAuthResource(siteUrl, {
        body: (request.body ?? {}) as Record<string, unknown>,
        query: request.query ?? null,
    });
    if (
        parentResource !== null &&
        requested !== null &&
        parentResource !== requested
    )
        throw new InvalidTargetError();
    return parentResource ?? requested ?? oauthApiResource(siteUrl);
};
