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

const EMAIL_PROVIDER_LIST = [
    'gmail.com',
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
    'googlemail.com',
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
];

const isEmailProviderDomain = (domain: string): boolean =>
    EMAIL_PROVIDER_LIST.includes(domain);

const VALID_EMAIL_DOMAIN_REGEX = /^[a-zA-Z0-9][\w.-]+\.\w{2,4}/g;
export const isValidEmailDomain = (value: string) =>
    value.match(VALID_EMAIL_DOMAIN_REGEX);

export const validateOrganizationEmailDomains = (domains: string[]) => {
    const invalidDomains = domains.filter((domain) =>
        isEmailProviderDomain(domain),
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
