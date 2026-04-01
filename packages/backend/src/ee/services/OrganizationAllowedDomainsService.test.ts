import {
    AllowedDomain,
    ForbiddenError,
    ParameterError,
    SessionUser,
} from '@lightdash/common';
import { OrganizationModel } from '../../models/OrganizationModel';
import { CommercialFeatureFlagModel } from '../models/CommercialFeatureFlagModel';
import {
    OrganizationAllowedDomainsService,
    validateDomain,
} from './OrganizationAllowedDomainsService';

// ---------------------------------------------------------------------------
// validateDomain – pure function tests
// ---------------------------------------------------------------------------
describe('validateDomain', () => {
    // --- valid inputs ---
    it.each([
        ['https://example.com', 'https://example.com'],
        ['https://example.com/', 'https://example.com'], // trailing slash stripped
        ['https://app.example.com', 'https://app.example.com'],
        ['https://example.com:3000', 'https://example.com:3000'],
        ['http://localhost', 'http://localhost'],
        ['http://localhost:3000', 'http://localhost:3000'],
        ['http://127.0.0.1', 'http://127.0.0.1'],
        ['http://127.0.0.1:8080', 'http://127.0.0.1:8080'],
        ['  https://example.com  ', 'https://example.com'], // whitespace trimmed
    ])('accepts %s → %s', (input, expected) => {
        expect(validateDomain(input)).toBe(expected);
    });

    // --- wildcard domains ---
    it.each([
        ['*.example.com', '*.example.com'],
        ['*.sub.example.com', '*.sub.example.com'],
        ['*.Example.COM', '*.example.com'], // lowercased
    ])('accepts wildcard %s → %s', (input, expected) => {
        expect(validateDomain(input)).toBe(expected);
    });

    // --- invalid inputs ---
    it.each([
        ['*', 'Wildcard domains must have at least a second-level domain'],
        ['*.com', 'Wildcard domains must have at least a second-level domain'],
        ['not-a-url', 'Invalid domain format'],
        ['ftp://example.com', 'Domain must use https://'],
        ['http://example.com', 'Domain must use https://'], // http only for localhost
        ['https://example.com/path', 'no path'],
        ['https://example.com?q=1', 'no path'],
        ['https://example.com#hash', 'no path'],
    ])('rejects %s with error containing "%s"', (input, errorSubstring) => {
        expect(() => validateDomain(input)).toThrow(ParameterError);
        expect(() => validateDomain(input)).toThrow(errorSubstring);
    });
});

// ---------------------------------------------------------------------------
// Wildcard matching logic (mirrors App.ts CORS callback)
// ---------------------------------------------------------------------------
describe('wildcard subdomain matching', () => {
    function matchesWildcard(
        wildcardDomain: string,
        origin: string,
    ): boolean {
        const baseDomain = wildcardDomain.slice(2); // remove "*."
        try {
            const originHost = new URL(origin).hostname;
            return originHost.endsWith(`.${baseDomain}`);
        } catch {
            return false;
        }
    }

    it('matches valid subdomains', () => {
        expect(matchesWildcard('*.example.com', 'https://app.example.com')).toBe(true);
        expect(matchesWildcard('*.example.com', 'https://deep.sub.example.com')).toBe(true);
    });

    it('does not match the bare domain', () => {
        expect(matchesWildcard('*.example.com', 'https://example.com')).toBe(false);
    });

    it('does not match domains that merely end with the same string', () => {
        // Security: fakeexample.com should NOT match *.example.com
        expect(matchesWildcard('*.example.com', 'https://fakeexample.com')).toBe(false);
        expect(matchesWildcard('*.example.com', 'https://notexample.com')).toBe(false);
    });

    it('does not match unrelated domains', () => {
        expect(matchesWildcard('*.example.com', 'https://other.com')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Service – feature flag gating + duplicate detection
// ---------------------------------------------------------------------------
describe('OrganizationAllowedDomainsService', () => {
    const mockOrganizationModel = {
        get: jest.fn(),
        getAllowedDomainsByOrganizationUuid: jest.fn(),
        getAllAllowedDomains: jest.fn(),
        createAllowedDomain: jest.fn(),
        deleteAllowedDomain: jest.fn(),
    };

    const mockFeatureFlagModel = {
        get: jest.fn(),
    };

    const mockAdminAbility = {
        can: jest.fn().mockReturnValue(true),
        cannot: jest.fn().mockReturnValue(false),
    };

    const mockUser = {
        userUuid: 'user-uuid-1',
        organizationUuid: 'org-uuid-1',
        ability: mockAdminAbility,
    } as unknown as SessionUser;

    let service: OrganizationAllowedDomainsService;

    beforeEach(() => {
        jest.clearAllMocks();

        mockOrganizationModel.get.mockResolvedValue({
            organizationUuid: 'org-uuid-1',
            name: 'Test Org',
        });

        service = new OrganizationAllowedDomainsService({
            organizationModel:
                mockOrganizationModel as unknown as OrganizationModel,
            commercialFeatureFlagModel:
                mockFeatureFlagModel as unknown as CommercialFeatureFlagModel,
        });
    });

    describe('authorization', () => {
        it('throws ForbiddenError when user is not an org admin', async () => {
            const viewerUser = {
                userUuid: 'user-uuid-2',
                organizationUuid: 'org-uuid-1',
                ability: {
                    can: jest.fn().mockReturnValue(false),
                    cannot: jest.fn().mockReturnValue(true),
                },
            } as unknown as SessionUser;

            await expect(
                service.getAllowedDomains(viewerUser),
            ).rejects.toThrow(ForbiddenError);

            await expect(
                service.addAllowedDomain(viewerUser, {
                    domain: 'https://example.com',
                    type: 'sdk',
                }),
            ).rejects.toThrow(ForbiddenError);

            await expect(
                service.deleteAllowedDomain(viewerUser, 'dom-1'),
            ).rejects.toThrow(ForbiddenError);
        });
    });

    describe('feature flag gating', () => {
        it('throws ForbiddenError when embedding feature is disabled', async () => {
            mockFeatureFlagModel.get.mockResolvedValue({ enabled: false });

            await expect(
                service.getAllowedDomains(mockUser),
            ).rejects.toThrow(ForbiddenError);
        });

        it('throws ForbiddenError when user has no organization', async () => {
            const noOrgUser = {
                userUuid: 'user-uuid-1',
                organizationUuid: undefined,
            } as SessionUser;

            await expect(
                service.getAllowedDomains(noOrgUser),
            ).rejects.toThrow(ForbiddenError);
        });

        it('returns domains when feature is enabled', async () => {
            mockFeatureFlagModel.get.mockResolvedValue({ enabled: true });
            const domains: AllowedDomain[] = [
                {
                    organizationAllowedDomainUuid: 'dom-1',
                    domain: 'https://app.example.com',
                    type: 'sdk',
                    createdAt: new Date(),
                    createdByUserUuid: 'user-uuid-1',
                },
            ];
            mockOrganizationModel.getAllowedDomainsByOrganizationUuid.mockResolvedValue(
                domains,
            );

            const result = await service.getAllowedDomains(mockUser);
            expect(result).toEqual(domains);
        });
    });

    describe('addAllowedDomain', () => {
        beforeEach(() => {
            mockFeatureFlagModel.get.mockResolvedValue({ enabled: true });
        });

        it('rejects duplicate domains', async () => {
            mockOrganizationModel.getAllowedDomainsByOrganizationUuid.mockResolvedValue(
                [
                    {
                        organizationAllowedDomainUuid: 'dom-1',
                        domain: 'https://example.com',
                        type: 'sdk',
                        createdAt: new Date(),
                        createdByUserUuid: null,
                    },
                ],
            );

            await expect(
                service.addAllowedDomain(mockUser, {
                    domain: 'https://example.com',
                    type: 'embed',
                }),
            ).rejects.toThrow(ParameterError);
            await expect(
                service.addAllowedDomain(mockUser, {
                    domain: 'https://example.com',
                    type: 'embed',
                }),
            ).rejects.toThrow('already in the allowed list');
        });

        it('validates and normalizes domain before creating', async () => {
            mockOrganizationModel.getAllowedDomainsByOrganizationUuid.mockResolvedValue(
                [],
            );
            mockOrganizationModel.createAllowedDomain.mockResolvedValue({
                organizationAllowedDomainUuid: 'dom-new',
                domain: 'https://example.com',
                type: 'sdk',
                createdAt: new Date(),
                createdByUserUuid: 'user-uuid-1',
            });

            await service.addAllowedDomain(mockUser, {
                domain: 'https://example.com/',
                type: 'sdk',
            });

            expect(
                mockOrganizationModel.createAllowedDomain,
            ).toHaveBeenCalledWith(
                'org-uuid-1',
                'https://example.com', // trailing slash normalized
                'sdk',
                'user-uuid-1',
            );
        });

        it('rejects invalid domains', async () => {
            await expect(
                service.addAllowedDomain(mockUser, {
                    domain: 'not-a-url',
                    type: 'sdk',
                }),
            ).rejects.toThrow(ParameterError);
        });
    });

    describe('getAllDomainsForMiddleware', () => {
        it('returns all domains without feature flag check', async () => {
            const domains: AllowedDomain[] = [
                {
                    organizationAllowedDomainUuid: 'dom-1',
                    domain: 'https://a.com',
                    type: 'sdk',
                    createdAt: new Date(),
                    createdByUserUuid: null,
                },
            ];
            mockOrganizationModel.getAllAllowedDomains.mockResolvedValue(
                domains,
            );

            const result = await service.getAllDomainsForMiddleware();
            expect(result).toEqual(domains);
            expect(mockFeatureFlagModel.get).not.toHaveBeenCalled();
        });
    });
});
