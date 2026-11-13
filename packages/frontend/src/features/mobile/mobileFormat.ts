export const maskEmail = (email: string | undefined) => {
    if (!email) return null;
    const at = email.lastIndexOf('@');
    if (at <= 0) return '••••';
    return `${email[0]}••••${email.slice(at)}`;
};

export const getHost = (siteUrl: string | undefined) => {
    if (!siteUrl) return window.location.host;
    try {
        return new URL(siteUrl).host;
    } catch {
        return window.location.host;
    }
};
