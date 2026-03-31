export type AllowedDomainType = 'sdk' | 'embed';

export type AllowedDomain = {
    organizationAllowedDomainUuid: string;
    domain: string;
    type: AllowedDomainType;
    createdAt: Date;
    createdByUserUuid: string | null;
};

export type CreateAllowedDomain = {
    domain: string;
    type: AllowedDomainType;
};

export type ApiOrganizationAllowedDomainsResponse = {
    status: 'ok';
    results: AllowedDomain[];
};

export type ApiOrganizationAllowedDomainResponse = {
    status: 'ok';
    results: AllowedDomain;
};
