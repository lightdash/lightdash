export const getMcpAppRedirectPath = (
    redirect: unknown,
    siteUrl: string,
): string => {
    if (typeof redirect !== 'string') {
        return '/';
    }
    const site = new URL(siteUrl);
    let target: URL;
    try {
        target = new URL(redirect, site);
    } catch {
        return '/';
    }
    if (target.origin !== site.origin) {
        return '/';
    }
    return `${target.pathname}${target.search}${target.hash}`;
};
