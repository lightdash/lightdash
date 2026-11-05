export const ALLOWED_STRICT_NATIVE_REDIRECT_SCHEMES: readonly string[] = [
    'cursor:',
    'vscode:',
    'vscode-insiders:',
    'windsurf:',
    'lightdash:',
];

const loopbackUriPattern =
    /^(http:\/\/(?:localhost|127\.0\.0\.1|\[::1\]))(?::(\d+|\*))?([/?].*)?$/i;

export const isAllowedStrictRedirectUri = (uri: string): boolean => {
    if (/[\u0000-\u0020\u007f\\#]/.test(uri)) return false;
    const loopback = loopbackUriPattern.exec(uri);
    const parsedUri =
        loopback?.[2] === '*' ? `${loopback[1]}:1${loopback[3] ?? ''}` : uri;
    if (parsedUri.includes('*')) return false;
    if (/^[a-z][a-z\d+.-]*:\/\/[^/?]*@/i.test(parsedUri)) return false;

    try {
        const url = new URL(parsedUri);
        if (url.username || url.password) return false;
        if (url.protocol === 'https:')
            return /^https:\/\//i.test(uri) && url.hostname !== '';
        if (url.protocol === 'http:') return loopback !== null;
        return (
            url.protocol.includes('.') ||
            ALLOWED_STRICT_NATIVE_REDIRECT_SCHEMES.includes(url.protocol)
        );
    } catch {
        return false;
    }
};

export const matchesRedirectUriStrict = (
    candidate: string,
    registered: string,
): boolean => {
    if (
        candidate.includes('*') ||
        !isAllowedStrictRedirectUri(candidate) ||
        !isAllowedStrictRedirectUri(registered)
    )
        return false;
    if (candidate === registered) return true;
    const candidateLoopback = loopbackUriPattern.exec(candidate);
    const registeredLoopback = loopbackUriPattern.exec(registered);
    return (
        candidateLoopback !== null &&
        registeredLoopback !== null &&
        candidateLoopback[1] === registeredLoopback[1] &&
        (candidateLoopback[3] ?? '') === (registeredLoopback[3] ?? '')
    );
};
