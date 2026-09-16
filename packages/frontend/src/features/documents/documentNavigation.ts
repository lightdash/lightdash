export const getDocumentReturnUrl = (
    returnTo: string | null,
    projectUuid: string,
): string => {
    const fallback = `/projects/${projectUuid}/documents`;
    if (
        !returnTo ||
        !returnTo.startsWith('/projects/') ||
        returnTo.includes('\\') ||
        /\p{Cc}/u.test(returnTo)
    ) {
        return fallback;
    }
    const base = 'https://lightdash.invalid';
    try {
        const url = new URL(returnTo, base);
        return url.origin === base && url.pathname.startsWith('/projects/')
            ? `${url.pathname}${url.search}${url.hash}`
            : fallback;
    } catch {
        return fallback;
    }
};
