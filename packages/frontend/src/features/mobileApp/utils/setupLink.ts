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

const parseInstanceOrigin = (value: string): string | null => {
    try {
        const url = new URL(value);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
        return url.origin;
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
