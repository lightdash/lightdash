import freeEmailDomains from 'free-email-domains';

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
 * Public-provider domains that the `free-email-domains` list doesn't cover but
 * that still can't be owned by a single customer org on a shared instance:
 * - Corporate provider roots that aren't free webmail (Google Workspace /
 *   Microsoft 365 tenant roots).
 * - Consumer providers the list happens to omit (e.g. the French ISP `sfr.fr`,
 *   carried over from the previous hand-maintained list).
 */
const ADDITIONAL_PUBLIC_PROVIDER_DOMAINS = [
    'google.com',
    'microsoft.com',
    'onmicrosoft.com',
    'sfr.fr',
];

/**
 * Single source of truth for public / consumer email-provider domains that no
 * single organization can legitimately own. Used to block these domains from
 * being claimed as an organization email domain (auto-join) AND from being
 * verified as an SSO routing domain — receiving an OTP at e.g. `gmail.com`
 * proves nothing about owning the provider.
 *
 * Backed by the maintained Kickbox `free-email-domains` package (~10k entries,
 * updated via the dependency) plus the corporate provider roots above. It's a
 * vendored static set, never a runtime fetch. Note this is a best-effort
 * heuristic, not a hard security boundary — a brand-new provider slips through
 * until the list updates.
 */
export const PUBLIC_EMAIL_PROVIDER_DOMAINS = new Set<string>([
    ...freeEmailDomains,
    ...ADDITIONAL_PUBLIC_PROVIDER_DOMAINS,
]);

/**
 * Whether a domain is a public/consumer email provider that no single
 * organization can own. Normalizes case before checking.
 */
export const isPublicEmailProviderDomain = (domain: string): boolean =>
    PUBLIC_EMAIL_PROVIDER_DOMAINS.has(domain.trim().toLowerCase());

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
