export const getHost = (siteUrl: string | undefined) => {
    if (!siteUrl) return window.location.host;
    try {
        return new URL(siteUrl).host;
    } catch {
        return window.location.host;
    }
};
