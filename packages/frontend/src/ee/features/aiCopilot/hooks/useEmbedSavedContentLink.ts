import useApp from '../../../../providers/App/useApp';
import useEmbed from '../../../providers/Embed/useEmbed';

export const getEmbedSavedContentHref = (
    href: string,
    context: {
        projectUuid: string;
        agentUuid: string;
        embedToken: string;
        siteUrl: string;
    },
): string | null => {
    const { projectUuid, agentUuid, embedToken, siteUrl } = context;
    let url: URL;
    let base: URL;
    try {
        base = new URL(siteUrl);
        url = new URL(href, base);
    } catch {
        return null;
    }
    if (url.origin !== base.origin) return null;
    const match = url.pathname.match(
        /^\/projects\/([^/]+)\/(saved|dashboards)\/([^/]+)(?:\/view)?\/?$/,
    );
    if (!match || match[1] !== projectUuid) return null;
    const type = match[2] === 'saved' ? 'chart' : 'dashboard';
    const destination = new URL(
        `/embed/${encodeURIComponent(projectUuid)}/ai-agents/${encodeURIComponent(agentUuid)}/saved-content/${type}/${match[3]}`,
        base,
    );
    destination.search = url.search;
    destination.hash = embedToken;
    return destination.href;
};

export const useEmbedSavedContentLink = (
    href: string | undefined,
): string | null => {
    const { embedToken, content, projectUuid } = useEmbed();
    const { health } = useApp();
    if (
        !href ||
        !embedToken ||
        !projectUuid ||
        content?.type !== 'aiAgent' ||
        !health.data?.siteUrl
    )
        return null;
    return getEmbedSavedContentHref(href, {
        projectUuid,
        agentUuid: content.agentUuid,
        embedToken,
        siteUrl: health.data.siteUrl,
    });
};
