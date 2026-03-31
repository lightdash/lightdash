import {
    AllowedDomain,
    CommercialFeatureFlags,
    ConflictError,
    CreateAllowedDomain,
    ForbiddenError,
    ParameterError,
    SessionUser,
} from '@lightdash/common';
import { OrganizationModel } from '../../models/OrganizationModel';
import { BaseService } from '../../services/BaseService';
import { CommercialFeatureFlagModel } from '../models/CommercialFeatureFlagModel';
import { OrganizationAllowedDomainsModel } from '../models/OrganizationAllowedDomainsModel';

type Dependencies = {
    organizationAllowedDomainsModel: OrganizationAllowedDomainsModel;
    organizationModel: OrganizationModel;
    commercialFeatureFlagModel: CommercialFeatureFlagModel;
};

/**
 * Validates a domain string for use as a CORS origin / CSP frame-ancestor.
 * Accepts:
 *   - https://example.com
 *   - https://example.com:3000
 *   - *.example.com (subdomain wildcard, must have 2+ domain levels)
 *   - http://localhost, http://localhost:3000
 * Rejects:
 *   - bare *, *.com, paths, trailing slashes, query strings
 */
function validateDomain(raw: string): string {
    const trimmed = raw.trim().replace(/\/+$/, '');

    // Subdomain wildcard pattern: *.example.com (must have at least two levels after *)
    const wildcardMatch = trimmed.match(
        /^\*\.([a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+)$/,
    );
    if (wildcardMatch) {
        return `*.${wildcardMatch[1].toLowerCase()}`;
    }

    // Reject bare wildcard or too-broad wildcard like *.com
    if (
        trimmed === '*' ||
        (trimmed.startsWith('*.') && trimmed.split('.').length < 3)
    ) {
        throw new ParameterError(
            'Wildcard domains must have at least a second-level domain (e.g. *.example.com)',
        );
    }

    let url: URL;
    try {
        url = new URL(trimmed);
    } catch {
        throw new ParameterError(
            `Invalid domain format. Expected a valid origin like https://example.com`,
        );
    }

    // Protocol check
    const isLocalhost =
        url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (
        url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && isLocalhost)
    ) {
        throw new ParameterError(
            'Domain must use https:// (http:// is only allowed for localhost)',
        );
    }

    // Reject paths and query strings
    if (url.pathname !== '/' || url.search || url.hash) {
        throw new ParameterError(
            'Domain must be an origin only (no path, query string, or hash)',
        );
    }

    return url.origin;
}

export class OrganizationAllowedDomainsService extends BaseService {
    private readonly organizationAllowedDomainsModel: OrganizationAllowedDomainsModel;

    private readonly organizationModel: OrganizationModel;

    private readonly commercialFeatureFlagModel: CommercialFeatureFlagModel;

    constructor(dependencies: Dependencies) {
        super();
        this.organizationAllowedDomainsModel =
            dependencies.organizationAllowedDomainsModel;
        this.organizationModel = dependencies.organizationModel;
        this.commercialFeatureFlagModel =
            dependencies.commercialFeatureFlagModel;
    }

    private async checkFeatureEnabled(user: SessionUser): Promise<void> {
        const organization = await this.organizationModel.get(
            user.organizationUuid!,
        );
        if (!organization) {
            throw new ForbiddenError('Organization not found');
        }

        const flag = await this.commercialFeatureFlagModel.get({
            user: {
                userUuid: user.userUuid,
                organizationUuid: user.organizationUuid!,
                organizationName: organization.name,
            },
            featureFlagId: CommercialFeatureFlags.Embedding,
        });

        if (!flag.enabled) {
            throw new ForbiddenError('Feature not enabled');
        }
    }

    async getAllowedDomains(user: SessionUser): Promise<AllowedDomain[]> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('User does not belong to an organization');
        }

        await this.checkFeatureEnabled(user);

        const org = await this.organizationModel.get(organizationUuid);
        return this.organizationAllowedDomainsModel.getAllByOrganizationId(
            org.organizationId,
        );
    }

    async addAllowedDomain(
        user: SessionUser,
        body: CreateAllowedDomain,
    ): Promise<AllowedDomain> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('User does not belong to an organization');
        }

        await this.checkFeatureEnabled(user);

        const validatedDomain = validateDomain(body.domain);

        const org = await this.organizationModel.get(organizationUuid);

        // Check for duplicates (DB constraint will also catch this, but nicer error)
        const existing =
            await this.organizationAllowedDomainsModel.getAllByOrganizationId(
                org.organizationId,
            );
        if (existing.some((d) => d.domain === validatedDomain)) {
            throw new ConflictError(
                `Domain ${validatedDomain} is already in the allowed list`,
            );
        }

        return this.organizationAllowedDomainsModel.create({
            organization_id: org.organizationId,
            domain: validatedDomain,
            type: body.type,
            created_by_user_uuid: user.userUuid,
        });
    }

    async deleteAllowedDomain(
        user: SessionUser,
        domainUuid: string,
    ): Promise<void> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('User does not belong to an organization');
        }

        await this.checkFeatureEnabled(user);

        const org = await this.organizationModel.get(organizationUuid);
        await this.organizationAllowedDomainsModel.delete(
            org.organizationId,
            domainUuid,
        );
    }

    /**
     * Returns all domains across all orgs. Used by CORS/CSP middleware
     * which fires before auth (no org context available).
     */
    async getAllDomainsForMiddleware(): Promise<AllowedDomain[]> {
        return this.organizationAllowedDomainsModel.getAllDomains();
    }
}
