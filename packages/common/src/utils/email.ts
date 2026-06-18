import { isCompanyDomain } from 'company-email-validator';

export const getEmailDomain = (email: string): string => {
    if (/\s/.test(email)) {
        throw new Error(`Invalid email, contains whitespace: ${email}`);
    }

    const domains = email.split('@');
    if (domains.length !== 2 || !domains[1]) {
        throw new Error(`Invalid email: ${email}`);
    }
    return domains[1].toLowerCase();
};

/**
 * Public-provider domains that the package list doesn't cover but that still
 * can't be owned by a single customer org on a shared instance.
 */
const ADDITIONAL_PUBLIC_PROVIDER_DOMAINS = [
    'google.com',
    'microsoft.com',
    'onmicrosoft.com',
    'sfr.fr',
];

const ADDITIONAL_PUBLIC_PROVIDER_DOMAIN_SET = new Set(
    ADDITIONAL_PUBLIC_PROVIDER_DOMAINS,
);

/**
 * Whether a domain is a public/consumer email provider that no single
 * organization can own. Normalizes case before checking.
 */
export const isPublicEmailProviderDomain = (domain: string): boolean =>
    ADDITIONAL_PUBLIC_PROVIDER_DOMAIN_SET.has(domain.trim().toLowerCase()) ||
    !isCompanyDomain(domain.trim().toLowerCase());

const VALID_EMAIL_DOMAIN_REGEX = /^[a-zA-Z0-9][\w.-]+\.\w{2,4}/g;
export const isValidEmailDomain = (value: string) =>
    value.match(VALID_EMAIL_DOMAIN_REGEX);

export const validateOrganizationEmailDomains = (domains: string[]) => {
    const invalidDomains = domains.filter((domain) =>
        isPublicEmailProviderDomain(domain),
    );

    if (!invalidDomains.length) {
        return undefined;
    }

    const readableDomainList = new Intl.ListFormat('en-US', {
        style: 'long',
        type: 'conjunction',
    }).format(invalidDomains);

    return `${readableDomainList} ${
        invalidDomains.length === 1 ? 'is' : 'are'
    } not allowed as organization email(s)`;
};

export const isValidEmailAddress = (email: string): boolean =>
    /^[\w.+'-]+@[\w-]+\.[A-Za-z]{2,}(?:\.[A-Za-z]{2,})*$/.test(email);
