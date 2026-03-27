import { useEffect, useState } from 'react';

const EMBED_URL = import.meta.env.VITE_EMBED_URL || '';
const EMBED_URL_STORAGE_KEY = 'sdkTestApp.embedUrl';

type ParsedJwt = {
    header: Record<string, unknown>;
    payload: Record<string, unknown>;
    signature: string;
};

const normalizeInstanceUrl = (pathname: string, origin: string) => {
    if (pathname === '' || pathname === '/') {
        return `${origin}/`;
    }

    return `${origin}${pathname.endsWith('/') ? pathname : `${pathname}/`}`;
};

const parseEmbedUrl = (value: string) => {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
        return { instanceUrl: null, token: null };
    }

    try {
        const url = new URL(trimmedValue);
        const embedSegmentIndex = url.pathname.indexOf('/embed');
        const instancePath =
            embedSegmentIndex >= 0
                ? url.pathname.slice(0, embedSegmentIndex)
                : url.pathname;

        return {
            instanceUrl: normalizeInstanceUrl(instancePath, url.origin),
            token: url.hash ? url.hash.slice(1) : null,
        };
    } catch {
        const [instancePart, tokenPart] = trimmedValue.split('#');
        const embedSegmentIndex = instancePart.indexOf('embed');
        const maybeInstanceUrl =
            embedSegmentIndex >= 0
                ? instancePart.slice(0, embedSegmentIndex)
                : instancePart;

        return {
            instanceUrl: maybeInstanceUrl || null,
            token: tokenPart || null,
        };
    }
};

const getInitialEmbedUrl = () => {
    if (typeof window === 'undefined') {
        return EMBED_URL;
    }

    return localStorage.getItem(EMBED_URL_STORAGE_KEY) || EMBED_URL;
};

const decodeBase64Url = (value: string) => {
    const normalizedValue = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalizedValue.length % 4;
    const paddedValue =
        padding === 0
            ? normalizedValue
            : normalizedValue.padEnd(normalizedValue.length + (4 - padding), '=');

    return atob(paddedValue);
};

const parseJwt = (token: string | null): ParsedJwt | null => {
    if (!token) {
        return null;
    }

    const tokenParts = token.split('.');

    if (tokenParts.length !== 3) {
        return null;
    }

    try {
        const [header, payload, signature] = tokenParts;

        return {
            header: JSON.parse(decodeBase64Url(header)),
            payload: JSON.parse(decodeBase64Url(payload)),
            signature,
        };
    } catch {
        return null;
    }
};

export type EmbedConfigState = ReturnType<typeof useEmbedConfig>;

export function useEmbedConfig() {
    const [embedUrl, setEmbedUrl] = useState<string>(getInitialEmbedUrl);
    const [draftUrl, setDraftUrl] = useState<string>(getInitialEmbedUrl);
    const [instanceUrl, setInstanceUrl] = useState<string | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [parsedJwt, setParsedJwt] = useState<ParsedJwt | null>(null);
    const [isConfigOpen, setIsConfigOpen] = useState(false);

    useEffect(() => {
        const parsed = parseEmbedUrl(embedUrl);
        setInstanceUrl(parsed.instanceUrl);
        setToken(parsed.token);
        setParsedJwt(parseJwt(parsed.token));
    }, [embedUrl]);

    const applyDraftUrl = () => {
        const nextValue = draftUrl.trim();
        setEmbedUrl(nextValue);

        if (!nextValue) {
            localStorage.removeItem(EMBED_URL_STORAGE_KEY);
            return;
        }

        localStorage.setItem(EMBED_URL_STORAGE_KEY, nextValue);
    };

    const clearEmbedUrl = () => {
        setDraftUrl('');
        setEmbedUrl('');
        localStorage.removeItem(EMBED_URL_STORAGE_KEY);
    };

    return {
        applyDraftUrl,
        clearEmbedUrl,
        draftUrl,
        embedUrl,
        instanceUrl,
        isConfigOpen,
        parsedJwt,
        setDraftUrl,
        setIsConfigOpen,
        token,
    };
}
