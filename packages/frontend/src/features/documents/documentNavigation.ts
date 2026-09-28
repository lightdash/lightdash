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

/** Router state that opens a Document straight into the editor, e.g. right after creating it. */
export type DocumentNavigationState = { startEditing: true };

export const isStartEditingState = (
    state: unknown,
): state is DocumentNavigationState =>
    typeof state === 'object' &&
    state !== null &&
    'startEditing' in state &&
    state.startEditing === true;
