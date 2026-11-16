import { PROVISIONING_MAX_TOKEN_AGE_SECONDS } from '@lightdash/common';
import {
    createRemoteJWKSet,
    jwtVerify,
    type JWTPayload,
    type JWTVerifyGetKey,
} from 'jose';

const SIGNING_ALGORITHMS = ['RS256', 'ES256'];

const CLOCK_TOLERANCE_SECONDS = 5;

const DISCOVERY_TTL_MS = 60 * 60 * 1000;

// A failed lookup is remembered briefly so bad requests cannot each trigger a fetch.
const DISCOVERY_FAILURE_TTL_MS = 10 * 1000;

export type OidcTokenClaims = {
    subject: string;
    expiresAt: Date;
};

export class OidcTokenRejection extends Error {
    constructor(detail: string) {
        super(detail);
        this.name = 'OidcTokenRejection';
    }
}

type OpenIdConfiguration = {
    issuer?: unknown;
    jwks_uri?: unknown;
};

type Discovery = {
    keySet: Promise<JWTVerifyGetKey>;
    fetchedAt: number;
    failed: boolean;
};

export type OidcTokenVerifierOptions = {
    fetchOpenIdConfiguration: (issuer: string) => Promise<unknown>;
    createKeySet: (jwksUri: string) => JWTVerifyGetKey;
};

const fetchOpenIdConfiguration = async (issuer: string): Promise<unknown> => {
    const response = await fetch(
        `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`,
        { signal: AbortSignal.timeout(10_000) },
    );
    if (!response.ok) {
        throw new Error(
            `OpenID configuration request returned ${response.status}`,
        );
    }
    return response.json();
};

const isHttpsUrl = (value: string): boolean => {
    try {
        return new URL(value).protocol === 'https:';
    } catch {
        return false;
    }
};

// Verifies tokens from any OpenID Connect issuer, finding its keys by discovery.
export class OidcTokenVerifier {
    private readonly discoveryCache = new Map<string, Discovery>();

    private readonly fetchOpenIdConfiguration: (
        issuer: string,
    ) => Promise<unknown>;

    private readonly createKeySet: (jwksUri: string) => JWTVerifyGetKey;

    constructor(
        options: OidcTokenVerifierOptions = {
            fetchOpenIdConfiguration,
            createKeySet: (jwksUri) => createRemoteJWKSet(new URL(jwksUri)),
        },
    ) {
        this.fetchOpenIdConfiguration = options.fetchOpenIdConfiguration;
        this.createKeySet = options.createKeySet;
    }

    private async discoverKeySet(issuer: string): Promise<JWTVerifyGetKey> {
        if (!isHttpsUrl(issuer)) {
            throw new OidcTokenRejection('issuer is not an https URL');
        }
        let configuration: OpenIdConfiguration;
        try {
            configuration = (await this.fetchOpenIdConfiguration(
                issuer,
            )) as OpenIdConfiguration;
        } catch (error) {
            throw new OidcTokenRejection(
                error instanceof Error
                    ? error.message
                    : 'OpenID configuration is unreachable',
            );
        }
        if (
            configuration.issuer !== issuer ||
            typeof configuration.jwks_uri !== 'string' ||
            !isHttpsUrl(configuration.jwks_uri)
        ) {
            throw new OidcTokenRejection(
                'OpenID configuration does not describe the issuer',
            );
        }
        return this.createKeySet(configuration.jwks_uri);
    }

    // Concurrent callers share one lookup, and its result or failure is cached.
    private getKeySet(issuer: string): Promise<JWTVerifyGetKey> {
        const cached = this.discoveryCache.get(issuer);
        const ttl = cached?.failed
            ? DISCOVERY_FAILURE_TTL_MS
            : DISCOVERY_TTL_MS;
        if (cached && Date.now() - cached.fetchedAt < ttl) {
            return cached.keySet;
        }
        const entry: Discovery = {
            keySet: this.discoverKeySet(issuer),
            fetchedAt: Date.now(),
            failed: false,
        };
        entry.keySet.catch(() => {
            entry.failed = true;
        });
        this.discoveryCache.set(issuer, entry);
        return entry.keySet;
    }

    async verify(
        token: string,
        issuer: string,
        audience: string,
    ): Promise<OidcTokenClaims> {
        const keySet = await this.getKeySet(issuer);
        let payload: JWTPayload;
        try {
            ({ payload } = await jwtVerify(token, keySet, {
                algorithms: SIGNING_ALGORITHMS,
                issuer,
                audience,
                clockTolerance: CLOCK_TOLERANCE_SECONDS,
                maxTokenAge: PROVISIONING_MAX_TOKEN_AGE_SECONDS,
            }));
        } catch (error) {
            throw new OidcTokenRejection(
                error instanceof Error ? error.message : 'token check failed',
            );
        }
        if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
            throw new OidcTokenRejection('sub claim is missing');
        }
        if (typeof payload.exp !== 'number') {
            throw new OidcTokenRejection('exp claim is missing');
        }
        return {
            subject: payload.sub,
            expiresAt: new Date(payload.exp * 1000),
        };
    }
}
