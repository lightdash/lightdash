export type ClientInfo = {
    client: string;
    clientVersion: string | null;
    clientBuild: string | null;
};

const CLIENT_HEADER_PATTERN =
    /^([A-Za-z][A-Za-z0-9_-]{0,31})\/([0-9A-Za-z][0-9A-Za-z._-]{0,63})(?:\+([0-9A-Za-z._-]{1,32})| \(([0-9A-Za-z._-]{1,32})\))?$/;

export function parseLightdashClient({
    header,
    userAgent,
}: {
    header: string | undefined;
    userAgent: string | undefined;
}): ClientInfo {
    const unknown: ClientInfo = {
        client: 'unknown',
        clientVersion: null,
        clientBuild: null,
    };
    try {
        const value = header?.trim();
        const match =
            value && value.length <= 128
                ? CLIENT_HEADER_PATTERN.exec(value)
                : null;
        if (match) {
            return {
                client: match[1].toLowerCase(),
                clientVersion: match[2],
                clientBuild: match[3] ?? match[4] ?? null,
            };
        }
        const ua = userAgent?.slice(0, 512) ?? '';
        let client = 'unknown';
        if (ua.startsWith('Mozilla/')) client = 'web';
        else if (ua.startsWith('okhttp/') || ua.includes('Dalvik/'))
            client = 'android';
        else if (ua.includes('CFNetwork/') || ua.includes('Darwin/'))
            client = 'ios';
        return { ...unknown, client };
    } catch {
        return unknown;
    }
}
