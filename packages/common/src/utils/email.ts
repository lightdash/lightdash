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
 * Single source of truth for public / consumer email-provider domains that no
 * single organization can legitimately own. Used to block these domains from
 * being claimed as an organization email domain (auto-join) AND from being
 * verified as an SSO routing domain — receiving an OTP at e.g. `gmail.com`
 * proves nothing about owning the provider.
 *
 * Seeded from the previous `EMAIL_PROVIDER_LIST` here plus the corporate
 * domains that `OrganizationSsoService` separately blocked. Can be expanded
 * from a maintained list (e.g. Kickbox `free-email-domains`) if needed — keep
 * it a vendored static set, never a runtime fetch.
 */
export const PUBLIC_EMAIL_PROVIDER_DOMAINS = new Set([
    'gmail.com',
    'googlemail.com',
    'google.com',
    'microsoft.com',
    'onmicrosoft.com',
    'yahoo.com',
    'hotmail.com',
    'aol.com',
    'hotmail.co.uk',
    'hotmail.fr',
    'msn.com',
    'yahoo.fr',
    'wanadoo.fr',
    'orange.fr',
    'comcast.net',
    'yahoo.co.uk',
    'yahoo.com.br',
    'yahoo.co.in',
    'live.com',
    'rediffmail.com',
    'free.fr',
    'gmx.de',
    'web.de',
    'yandex.ru',
    'outlook.com',
    'uol.com.br',
    'bol.com.br',
    'mail.ru',
    'cox.net',
    'hotmail.it',
    'sbcglobal.net',
    'sfr.fr',
    'live.fr',
    'verizon.net',
    'live.co.uk',
    'yahoo.es',
    'ig.com.br',
    'live.nl',
    'bigpond.com',
    'terra.com.br',
    'yahoo.it',
    'yahoo.de',
    'rocketmail.com',
    'yahoo.in',
    'hotmail.es',
    'hotmail.de',
    'shaw.ca',
    'yahoo.co.jp',
    'sky.com',
    'blueyonder.co.uk',
    'icloud.com',
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
