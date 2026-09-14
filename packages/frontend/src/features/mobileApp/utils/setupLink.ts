const MOBILE_SETUP_LINK_VERSION = '1';

const MOBILE_APP_SCHEME = 'com.lightdash.mobile';

const SETUP_CODE_PATTERN = /^[A-Z2-7]{32}$/;

export type MobileSetupLinkParams = {
    instanceOrigin: string;
    code: string;
};

export type ParsedMobileSetupLink =
    | ({ status: 'valid' } & MobileSetupLinkParams)
    | { status: 'unsupported-version' }
    | { status: 'invalid' };

// Matches the Android parser exactly. Keep the two in step: a link one platform
// accepts and the other refuses is worse than either rule on its own.
const LOOPBACK_HOSTNAMES = ['localhost', '127.0.0.1'];

const parseInstanceOrigin = (value: string): string | null => {
    try {
        const url = new URL(value);
        if (url.protocol === 'https:') return url.origin;
        // Cleartext is for local development only. Without this a link naming
        // i=http://evil.example would send the app to a plaintext server.
        if (
            url.protocol === 'http:' &&
            LOOPBACK_HOSTNAMES.includes(url.hostname)
        ) {
            return url.origin;
        }
        return null;
    } catch {
        return null;
    }
};

export const parseMobileSetupLinkParams = (
    search: URLSearchParams,
): ParsedMobileSetupLink => {
    const version = search.get('v');
    if (version !== null && version !== MOBILE_SETUP_LINK_VERSION) {
        return { status: 'unsupported-version' };
    }

    const instanceOrigin = parseInstanceOrigin(search.get('i') ?? '');
    const code = search.get('c') ?? '';

    if (instanceOrigin === null || !SETUP_CODE_PATTERN.test(code)) {
        return { status: 'invalid' };
    }

    return { status: 'valid', instanceOrigin, code };
};

export const buildMobileSetupSchemeUrl = ({
    instanceOrigin,
    code,
}: MobileSetupLinkParams): string => {
    const params = new URLSearchParams({
        v: MOBILE_SETUP_LINK_VERSION,
        i: instanceOrigin,
        c: code,
    });
    return `${MOBILE_APP_SCHEME}://setup?${params.toString()}`;
};
