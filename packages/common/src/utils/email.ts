export const getEmailDomain = (email: string): string => {
    const domain = email.split('@')[1];
    if (!domain) {
        throw new Error(`Invalid email: ${email}`);
    }
    return domain.toLowerCase();
};

export const isEmailProviderDomain = (domain: string): boolean => {
    return EMAIL_PROVIDER_LIST.includes(domain);
}

const EMAIL_PROVIDER_LIST = [
    "gmail.com",
    "yahoo.com",
    "hotmail.com",
    "aol.com",
    "hotmail.co.uk",
    "hotmail.fr",
    "msn.com",
    "yahoo.fr",
    "wanadoo.fr",
    "orange.fr",
    "comcast.net",
    "yahoo.co.uk",
    "yahoo.com.br",
    "yahoo.co.in",
    "live.com",
    "rediffmail.com",
    "free.fr",
    "gmx.de",
    "web.de",
    "yandex.ru",
    "outlook.com",
    "uol.com.br",
    "bol.com.br",
    "mail.ru",
    "cox.net",
    "hotmail.it",
    "sbcglobal.net",
    "sfr.fr",
    "live.fr",
    "verizon.net",
    "live.co.uk",
    "googlemail.com",
    "yahoo.es",
    "ig.com.br",
    "live.nl",
    "bigpond.com",
    "terra.com.br",
    "yahoo.it",
    "yahoo.de",
    "rocketmail.com",
    "yahoo.in",
    "hotmail.es",
    "hotmail.de",
    "shaw.ca",
    "yahoo.co.jp",
    "sky.com",
    "blueyonder.co.uk",
];