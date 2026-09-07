import {
    getMicrosoftIssuer,
    getMicrosoftOpenIdConfigurationUrl,
    MANAGED_SIGN_IN_MAX_TOKEN_AGE_SECONDS,
    ManagedSignInError,
} from '@lightdash/common';
import {
    createRemoteJWKSet,
    decodeJwt,
    errors as joseErrors,
    jwtVerify,
    type JWTPayload,
    type JWTVerifyGetKey,
} from 'jose';
import { ManagedSignInRejection } from './ManagedSignInRejection';

const TENANT_ID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SIGNING_ALGORITHMS = ['RS256'];

const CLOCK_TOLERANCE_SECONDS = 5;

const DISCOVERY_TTL_MS = 60 * 60 * 1000;

const DISCOVERY_CACHE_MAX_ENTRIES = 50;

export type MicrosoftIdTokenClaims = JWTPayload & {
    tid: string;
    oid: string;
    email?: string;
};

type DiscoveryEntry = {
    issuer: string;
    keySet: JWTVerifyGetKey;
    fetchedAt: number;
};

type OpenIdConfiguration = {
    issuer?: unknown;
    jwks_uri?: unknown;
};

export type MicrosoftTokenVerifierOptions = {
    now?: () => number;
    fetchOpenIdConfiguration?: (tenantId: string) => Promise<unknown>;
    createKeySet?: (jwksUri: string) => JWTVerifyGetKey;
};

const defaultFetchOpenIdConfiguration = async (
    tenantId: string,
): Promise<unknown> => {
    const response = await fetch(getMicrosoftOpenIdConfigurationUrl(tenantId), {
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
        throw new Error(
            `OpenID configuration request returned ${response.status}`,
        );
    }
    return response.json();
};

const decodeUnverified = (token: string): JWTPayload => {
    try {
        return decodeJwt(token);
    } catch {
        throw new ManagedSignInRejection(
            ManagedSignInError.TOKEN_INVALID,
            'token is not a JWT',
        );
    }
};

const readTenantId = (payload: JWTPayload): string => {
    const tenantId = payload.tid;
    if (typeof tenantId !== 'string' || !TENANT_ID_PATTERN.test(tenantId)) {
        throw new ManagedSignInRejection(
            ManagedSignInError.TOKEN_INVALID,
            'tid claim is missing or malformed',
        );
    }
    return tenantId;
};

const describeTiming = (payload: JWTPayload, nowSeconds: number): string => {
    const claim = (name: 'iat' | 'nbf' | 'exp'): string => {
        const value = payload[name];
        return typeof value === 'number'
            ? `${name}=${value} (${value - nowSeconds}s)`
            : `${name}=absent`;
    };
    return `now=${nowSeconds} ${claim('iat')} ${claim('nbf')} ${claim(
        'exp',
    )} maxAge=${MANAGED_SIGN_IN_MAX_TOKEN_AGE_SECONDS}s clockTolerance=${CLOCK_TOLERANCE_SECONDS}s`;
};

const toRejection = (
    error: unknown,
    timing: string,
): ManagedSignInRejection => {
    if (error instanceof joseErrors.JWTExpired) {
        return new ManagedSignInRejection(
            ManagedSignInError.TOKEN_EXPIRED,
            `${error.claim} check failed ${timing}`,
        );
    }
    if (error instanceof joseErrors.JWTClaimValidationFailed) {
        return new ManagedSignInRejection(
            ManagedSignInError.TOKEN_INVALID,
            `${error.claim} check failed ${timing}`,
        );
    }
    return new ManagedSignInRejection(
        ManagedSignInError.TOKEN_INVALID,
        error instanceof Error ? error.message : 'signature check failed',
    );
};

export class MicrosoftTokenVerifier {
    private readonly discoveryCache = new Map<string, DiscoveryEntry>();

    private readonly now: () => number;

    private readonly fetchOpenIdConfiguration: (
        tenantId: string,
    ) => Promise<unknown>;

    private readonly createKeySet: (jwksUri: string) => JWTVerifyGetKey;

    constructor(options: MicrosoftTokenVerifierOptions = {}) {
        this.now = options.now ?? Date.now;
        this.fetchOpenIdConfiguration =
            options.fetchOpenIdConfiguration ?? defaultFetchOpenIdConfiguration;
        this.createKeySet =
            options.createKeySet ??
            ((jwksUri) => createRemoteJWKSet(new URL(jwksUri)));
    }

    private async getDiscovery(tenantId: string): Promise<DiscoveryEntry> {
        const cached = this.discoveryCache.get(tenantId);
        if (cached && this.now() - cached.fetchedAt < DISCOVERY_TTL_MS) {
            return cached;
        }

        let configuration: OpenIdConfiguration;
        try {
            configuration = (await this.fetchOpenIdConfiguration(
                tenantId,
            )) as OpenIdConfiguration;
        } catch (error) {
            throw new ManagedSignInRejection(
                ManagedSignInError.TOKEN_INVALID,
                error instanceof Error
                    ? error.message
                    : 'OpenID configuration is unreachable',
            );
        }

        const expectedIssuer = getMicrosoftIssuer(tenantId);
        if (
            typeof configuration.jwks_uri !== 'string' ||
            configuration.issuer !== expectedIssuer
        ) {
            throw new ManagedSignInRejection(
                ManagedSignInError.TOKEN_INVALID,
                'OpenID configuration does not describe the signing tenant',
            );
        }

        const entry: DiscoveryEntry = {
            issuer: expectedIssuer,
            keySet: this.createKeySet(configuration.jwks_uri),
            fetchedAt: this.now(),
        };

        if (this.discoveryCache.size >= DISCOVERY_CACHE_MAX_ENTRIES) {
            const [oldest] = this.discoveryCache.keys();
            this.discoveryCache.delete(oldest);
        }
        this.discoveryCache.set(tenantId, entry);
        return entry;
    }

    async verify(
        token: string,
        audiences: string[],
    ): Promise<MicrosoftIdTokenClaims> {
        const unverified = decodeUnverified(token);
        const tenantId = readTenantId(unverified);
        const { issuer, keySet } = await this.getDiscovery(tenantId);

        let payload: JWTPayload;
        try {
            ({ payload } = await jwtVerify(token, keySet, {
                algorithms: SIGNING_ALGORITHMS,
                issuer,
                audience: audiences,
                clockTolerance: CLOCK_TOLERANCE_SECONDS,
                maxTokenAge: MANAGED_SIGN_IN_MAX_TOKEN_AGE_SECONDS,
            }));
        } catch (error) {
            throw toRejection(
                error,
                describeTiming(unverified, Math.floor(this.now() / 1000)),
            );
        }

        if (payload.tid !== tenantId) {
            throw new ManagedSignInRejection(
                ManagedSignInError.TOKEN_INVALID,
                'tid claim changed between decode and verify',
            );
        }
        if (typeof payload.oid !== 'string' || payload.oid.length === 0) {
            throw new ManagedSignInRejection(
                ManagedSignInError.TOKEN_INVALID,
                'oid claim is missing',
            );
        }
        if (typeof payload.exp !== 'number') {
            throw new ManagedSignInRejection(
                ManagedSignInError.TOKEN_INVALID,
                'exp claim is missing',
            );
        }

        return payload as MicrosoftIdTokenClaims;
    }
}
