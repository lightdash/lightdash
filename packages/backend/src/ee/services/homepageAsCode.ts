import {
    assertUnreachable,
    ParameterError,
    type HomepageActionAsCode,
    type HomepageAsCode,
    type HomepageBlock,
    type HomepageBlockAsCode,
    type HomepageConfig,
    type HomepageQuickAction,
} from '@lightdash/common';

export type HomepageContentReference = {
    contentType: 'chart' | 'dashboard' | 'space' | 'data_app' | 'document';
    uuid: string;
    slug: string;
};

const linkContentTypes: Record<
    string,
    HomepageContentReference['contentType']
> = {
    dashboards: 'dashboard',
    saved: 'chart',
    spaces: 'space',
    apps: 'data_app',
    documents: 'document',
};

const resolveReference = (
    references: HomepageContentReference[],
    type: HomepageContentReference['contentType'],
    value: string,
    direction: 'download' | 'upload',
    onDocumentReference?: (uuid: string) => void,
): string => {
    const matches = references.filter(
        (ref) =>
            ref.contentType === type &&
            ref[direction === 'download' ? 'uuid' : 'slug'] === value,
    );
    if (matches.length !== 1) {
        if (type === 'document') {
            throw new ParameterError(
                'Homepage Document reference is missing or inaccessible',
            );
        }
        throw new ParameterError(
            `Homepage reference ${type} "${value}" is ${matches.length === 0 ? 'missing' : 'ambiguous'} in this project`,
        );
    }
    if (type === 'document') {
        onDocumentReference?.(matches[0].uuid);
    }
    return matches[0][direction === 'download' ? 'slug' : 'uuid'];
};

const translateLinks = (
    content: string,
    projectUuid: string,
    references: HomepageContentReference[],
    direction: 'download' | 'upload',
    siteUrl: string,
    onDocumentReference?: (uuid: string) => void,
): string => {
    if (direction === 'download') {
        return content.replace(
            /https?:\/\/[^\s)]+|\/projects\/[^/\s)]+\/(?:dashboards|saved|spaces|apps|documents)\/[^/\s)#?]+(?:\/view)?/g,
            (match) => {
                let value = match;
                if (/^https?:/.test(match)) {
                    let url: URL;
                    try {
                        url = new URL(match);
                    } catch {
                        return match;
                    }
                    if (url.origin !== new URL(siteUrl).origin) return match;
                    value = `${url.pathname}${url.search}${url.hash}`;
                }
                const parts = value.match(
                    /^\/projects\/([^/]+)\/(dashboards|saved|spaces|apps|documents)\/([^/\s)#?]+)(\/view)?(.*)$/,
                );
                if (!parts || parts[1] !== projectUuid) return match;
                const [, , path, uuid, view, suffix] = parts;
                const type = linkContentTypes[path];
                return `lightdash://${path}/${encodeURIComponent(resolveReference(references, type, uuid, direction, onDocumentReference))}${view ?? ''}${suffix}`;
            },
        );
    }
    return content.replace(
        /lightdash:\/\/(dashboards|saved|spaces|apps|documents)\/([^/\s)#?]+)(\/view)?/g,
        (
            _match,
            path: string,
            encodedSlug: string,
            view: string | undefined,
        ) => {
            let slug: string;
            try {
                slug = decodeURIComponent(encodedSlug);
            } catch {
                throw new ParameterError('Invalid encoded homepage link');
            }
            const type = linkContentTypes[path];
            return `/projects/${projectUuid}/${path}/${resolveReference(references, type, slug, direction, onDocumentReference)}${view ?? ''}`;
        },
    );
};

export const downloadHomepageConfig = (
    config: HomepageConfig,
    projectUuid: string,
    references: HomepageContentReference[],
    siteUrl: string,
    onDocumentReference?: (uuid: string) => void,
): HomepageAsCode['config'] => {
    const ref = (type: HomepageContentReference['contentType'], uuid: string) =>
        resolveReference(
            references,
            type,
            uuid,
            'download',
            onDocumentReference,
        );
    const link = (value: string) =>
        translateLinks(
            value,
            projectUuid,
            references,
            'download',
            siteUrl,
            onDocumentReference,
        );
    const action = (value: HomepageQuickAction): HomepageActionAsCode => {
        switch (value.type) {
            case 'dashboard': {
                const { dashboardUuid, ...rest } = value;
                return {
                    ...rest,
                    dashboardSlug: ref('dashboard', dashboardUuid),
                };
            }
            case 'space': {
                const { spaceUuid, ...rest } = value;
                return { ...rest, spaceSlug: ref('space', spaceUuid) };
            }
            default:
                return value;
        }
    };
    const block = (value: HomepageBlock): HomepageBlockAsCode => {
        switch (value.type) {
            case 'collection':
                return {
                    ...value,
                    config: {
                        ...value.config,
                        items: value.config.items.map(
                            ({ uuid, contentType }) => ({
                                contentType,
                                slug: ref(contentType, uuid),
                            }),
                        ),
                    },
                };
            case 'resources':
                return {
                    ...value,
                    config: {
                        ...value.config,
                        items: value.config.items.map(
                            ({ appUuid, imageUrl, ...item }) => ({
                                ...item,
                                ...(appUuid ? {} : { imageUrl }),
                                url: link(item.url),
                                ...(appUuid
                                    ? { appSlug: ref('data_app', appUuid) }
                                    : {}),
                            }),
                        ),
                    },
                };
            case 'quick-actions':
                return {
                    ...value,
                    config: { actions: value.config.actions.map(action) },
                };
            case 'cta':
                return {
                    ...value,
                    config: {
                        ...value.config,
                        target:
                            value.config.target.type === 'link'
                                ? {
                                      type: 'link',
                                      url: link(value.config.target.url),
                                  }
                                : action(value.config.target),
                    },
                };
            case 'markdown':
                return {
                    ...value,
                    config: { content: link(value.config.content) },
                };
            case 'announcements':
            case 'ask-ai-hero':
            case 'greeting':
            case 'metrics':
            case 'favorites':
            case 'recent':
                return value;
            default:
                return assertUnreachable(value, 'Homepage block');
        }
    };
    return {
        version: 1,
        rows: config.rows.map((row) => ({
            ...row,
            blocks: row.blocks.map(block),
        })),
    };
};

export const uploadHomepageConfig = (
    config: HomepageAsCode['config'],
    projectUuid: string,
    references: HomepageContentReference[],
    siteUrl: string,
    onDocumentReference?: (uuid: string) => void,
): HomepageConfig => {
    const ref = (type: HomepageContentReference['contentType'], slug: string) =>
        resolveReference(references, type, slug, 'upload', onDocumentReference);
    const link = (value: string) =>
        translateLinks(
            value,
            projectUuid,
            references,
            'upload',
            siteUrl,
            onDocumentReference,
        );
    const action = (value: HomepageActionAsCode): HomepageQuickAction => {
        switch (value.type) {
            case 'dashboard': {
                const { dashboardSlug, ...rest } = value;
                return {
                    ...rest,
                    dashboardUuid: ref('dashboard', dashboardSlug),
                };
            }
            case 'space': {
                const { spaceSlug, ...rest } = value;
                return { ...rest, spaceUuid: ref('space', spaceSlug) };
            }
            default:
                return value;
        }
    };
    const block = (value: HomepageBlockAsCode): HomepageBlock => {
        switch (value.type) {
            case 'collection':
                return {
                    ...value,
                    config: {
                        ...value.config,
                        items: value.config.items.map(
                            ({ slug, contentType }) => ({
                                contentType,
                                uuid: ref(contentType, slug),
                            }),
                        ),
                    },
                };
            case 'resources':
                return {
                    ...value,
                    config: {
                        ...value.config,
                        items: value.config.items.map(
                            ({ appSlug, ...item }) => ({
                                ...item,
                                url: link(item.url),
                                ...(appSlug
                                    ? { appUuid: ref('data_app', appSlug) }
                                    : {}),
                            }),
                        ),
                    },
                };
            case 'quick-actions':
                return {
                    ...value,
                    config: { actions: value.config.actions.map(action) },
                };
            case 'cta':
                return {
                    ...value,
                    config: {
                        ...value.config,
                        target:
                            value.config.target.type === 'link'
                                ? {
                                      type: 'link',
                                      url: link(value.config.target.url),
                                  }
                                : action(value.config.target),
                    },
                };
            case 'markdown':
                return {
                    ...value,
                    config: { content: link(value.config.content) },
                };
            case 'announcements':
            case 'ask-ai-hero':
            case 'greeting':
            case 'metrics':
            case 'favorites':
            case 'recent':
                return value;
            default:
                return assertUnreachable(value, 'Homepage block');
        }
    };
    return {
        version: 1,
        rows: config.rows.map((row) => ({
            ...row,
            blocks: row.blocks.map(block),
        })),
    };
};
