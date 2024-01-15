export const getEmailDomain = (email: string): string => {
    if (/\s/.test(email)) {
        throw new Error(`Invalid email, contains whitespace: ${email}`);
    }

    const domain = email.split('@')[1];
    if (!domain) {
        throw new Error(`Invalid email: ${email}`);
    }
    return domain.toLowerCase();
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
];

const isEmailProviderDomain = (domain: string): boolean =>
    EMAIL_PROVIDER_LIST.includes(domain);

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
