import { assertUnreachable, type CreateEmbedJwt } from '@lightdash/common';

export const EMBED_BACK_URL_PARAM = 'embedBackUrl';

export const getEmbedExploreSearch = (search: string, backUrl: string) => {
    const params = new URLSearchParams(search);
    params.set(EMBED_BACK_URL_PARAM, backUrl);
    return params.toString();
};

const getEmbedContentPath = (
    projectUuid: string,
    content: CreateEmbedJwt['content'] | undefined,
): string => {
    const base = `/embed/${projectUuid}`;
    switch (content?.type) {
        case 'aiAgent':
            return `${base}/ai-agents/${content.agentUuid}/threads`;
        case 'metricsCatalog':
            return `${base}/metrics`;
        case 'chart':
            return `${base}/chart/${content.contentId}`;
        case 'dataApp':
            return `${base}/app/${content.appUuid}`;
        case 'dashboard':
        case 'apiAccess':
        case undefined:
            return base;
        default:
            return assertUnreachable(content, 'Unknown embed content');
    }
};

export const getEmbedBackUrl = ({
    projectUuid,
    content,
    backUrl,
}: {
    projectUuid: string;
    content: CreateEmbedJwt['content'] | undefined;
    backUrl: unknown;
}): string => {
    const fallback = getEmbedContentPath(projectUuid, content);
    if (typeof backUrl !== 'string' || !backUrl.startsWith('/')) {
        return fallback;
    }

    try {
        const url = new URL(backUrl, 'https://embed.invalid');
        if (url.origin !== 'https://embed.invalid' || url.hash) {
            return fallback;
        }

        // An AI-agent embed returns to its conversation or to a saved
        // dashboard it opened from one.
        const isContentRoute =
            url.pathname === fallback ||
            (content?.type === 'aiAgent' &&
                url.pathname.startsWith(
                    `/embed/${projectUuid}/ai-agents/${content.agentUuid}/`,
                )) ||
            (content?.type === 'dashboard' &&
                url.pathname.startsWith(`${fallback}/tabs/`));

        return isContentRoute ? `${url.pathname}${url.search}` : fallback;
    } catch {
        return fallback;
    }
};
