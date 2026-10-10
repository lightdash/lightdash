const hierarchicalUriPattern =
    /^([a-z][a-z\d+.-]*:)\/\/(\[[^\]]+\]|[^:/?#@]+)(?::(\*|\d+))?([/?][^#]*)?(#.*)?$/i;

export const matchesRegisteredRedirectUri = (
    candidate: string,
    registered: string,
): boolean => {
    if (candidate.includes('\\')) return false;

    try {
        const url = new URL(candidate);
        const authority = candidate
            .replace(/[\t\n\r]/g, '')
            .trim()
            .match(/^[^:]+:\/*([^/?#]*)/)?.[1];
        if (
            url.username ||
            url.password ||
            (url.host && authority?.includes('@'))
        ) {
            return false;
        }
        if (!registered.includes('*')) return candidate === registered;
        if (registered.includes('\\')) return false;

        const patternParts = registered.match(hierarchicalUriPattern);
        const candidateParts = candidate.match(hierarchicalUriPattern);
        if (!patternParts || !candidateParts) return false;

        const [, protocol, hostname, port, path = '', fragment = ''] =
            patternParts;
        const wildcardHostname = /^\*\.[^*]+$/.test(hostname);
        if (
            (hostname.includes('*') && !wildcardHostname) ||
            fragment.includes('*')
        ) {
            return false;
        }

        const registeredUrl = new URL(
            `${protocol}//${hostname}${port ? `:${port === '*' ? '1' : port}` : ''}${path}${fragment}`,
        );
        const [candidateLabel, ...candidateDomain] = url.hostname.split('.');
        const matchesHostname = wildcardHostname
            ? /^[a-z0-9-]+$/i.test(candidateLabel) &&
              candidateDomain.join('.').toLowerCase() ===
                  registeredUrl.hostname.slice(2).toLowerCase()
            : url.hostname.toLowerCase() ===
              registeredUrl.hostname.toLowerCase();
        if (url.protocol !== registeredUrl.protocol || !matchesHostname) {
            return false;
        }

        const [
            ,
            ,
            ,
            candidatePort,
            candidatePath = '',
            candidateFragment = '',
        ] = candidateParts;
        if (
            port === '*'
                ? !candidatePort || !/^\d+$/.test(candidatePort)
                : candidatePort !== port
        ) {
            return false;
        }

        const pathPattern = path
            .split('*')
            .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('.*');
        return (
            candidateFragment === fragment &&
            new RegExp(`^${pathPattern}$`).test(candidatePath)
        );
    } catch {
        return false;
    }
};
