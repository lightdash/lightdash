import { type Element, type Root } from 'hast';
import { visit } from 'unist-util-visit';

const CONTENT_TYPES = [
    'dashboard-link',
    'chart-link',
    'data-app-link',
    'artifact-link',
    'sql-runner-link',
    'settings-link',
    'scheduled-delivery-link',
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

export const isContentType = (value: unknown): value is ContentType =>
    typeof value === 'string' && CONTENT_TYPES.includes(value as ContentType);

interface LinkProcessor {
    fragment: string;
    contentType: ContentType;
    cleanUrl: (href: string) => string;
    extractData: (href: string) => Record<string, string | undefined>;
}

const LINK_PROCESSORS: LinkProcessor[] = [
    {
        fragment: '#dashboard-link',
        contentType: 'dashboard-link',
        cleanUrl: (href) => href.replace('#dashboard-link', ''),
        extractData: (href) => {
            const match = href.match(/\/dashboards\/([^\/]+)\/view/);
            return match ? { 'data-dashboard-uuid': match[1] } : {};
        },
    },
    {
        fragment: '#chart-link',
        contentType: 'chart-link',
        cleanUrl: (href) => href.replace(/#chart-link.*$/, ''),
        extractData: (href) => {
            const data: Record<string, string> = {};
            const chartMatch = href.match(/\/saved\/([^\/]+)\/view/);
            const typeMatch = href.match(/#chart-type-(.+?)($|#)/);

            if (chartMatch) data['data-chart-uuid'] = chartMatch[1];
            if (chartMatch) data['data-chart-source'] = 'saved-chart';
            if (typeMatch) data['data-chart-type'] = typeMatch[1];

            return data;
        },
    },
    {
        fragment: '#artifact-link',
        contentType: 'artifact-link',
        cleanUrl: (href) => href.replace(/#artifact-link.*$/, ''),
        extractData: (href) => {
            const data: Record<string, string> = {};
            const artifactUuidMatch = href.match(/#artifact-uuid-([^#]+)/);
            const versionUuidMatch = href.match(/#version-uuid-([^#]+)/);
            const artifactTypeMatch = href.match(/#artifact-type-([^#]+)/);

            if (artifactUuidMatch)
                data['data-artifact-uuid'] = artifactUuidMatch[1];
            if (versionUuidMatch)
                data['data-version-uuid'] = versionUuidMatch[1];
            if (artifactTypeMatch)
                data['data-artifact-type'] = artifactTypeMatch[1];

            return data;
        },
    },
    {
        fragment: '#sql-runner-link',
        contentType: 'sql-runner-link',
        cleanUrl: () => '#',
        extractData: () => ({}),
    },
];

interface UrlMatcher {
    pattern: RegExp;
    contentType: ContentType;
    // Whether the backend emits ?scheduler_uuid deep-links for this resource
    // (only dashboard/chart view pages open the delivery's edit modal).
    schedulable: boolean;
    extractData: (match: RegExpMatchArray) => Record<string, string>;
}

const URL_MATCHERS: UrlMatcher[] = [
    {
        pattern: /\/projects\/[^/]+\/dashboards\/([^/]+)\/view/,
        contentType: 'dashboard-link',
        schedulable: true,
        extractData: (match) => ({ 'data-dashboard-uuid': match[1] }),
    },
    {
        pattern: /\/projects\/[^/]+\/saved\/([^/]+)\/view/,
        contentType: 'chart-link',
        schedulable: true,
        extractData: (match) => ({
            'data-chart-uuid': match[1],
            'data-chart-source': 'saved-chart',
        }),
    },
    {
        pattern: /\/projects\/[^/]+\/apps\/([^/]+)\/view/,
        contentType: 'data-app-link',
        schedulable: false,
        extractData: (match) => ({ 'data-app-uuid': match[1] }),
    },
    {
        pattern: /\/projects\/[^/]+\/sql-runner\/([^/#?]+)/,
        contentType: 'chart-link',
        schedulable: false,
        extractData: (match) => ({
            'data-chart-uuid': match[1],
            'data-chart-source': 'sql-runner',
        }),
    },
    // Settings deep-links the agent emits (e.g. the "link your personal
    // GitHub" nudge → /generalSettings/profile). Captured as a same-origin
    // relative path so the click can route client-side instead of reloading.
    {
        pattern: /\/generalSettings\/[^\s)]*/,
        contentType: 'settings-link',
        schedulable: false,
        extractData: (match) => ({ 'data-settings-path': match[0] }),
    },
];

const processLink = (node: Element, href: string): void => {
    const processor = LINK_PROCESSORS.find((p) => href.includes(p.fragment));
    if (!processor) {
        for (const matcher of URL_MATCHERS) {
            const match = href.match(matcher.pattern);
            if (!match) continue;

            // A schedulable resource view URL plus ?scheduler_uuid is a
            // scheduled delivery deep link; classify it as such so the click
            // opens the delivery's edit modal instead of the resource preview.
            const schedulerMatch = matcher.schedulable
                ? href.match(/[?&]scheduler_uuid=([^&#]+)/)
                : null;

            node.properties = schedulerMatch
                ? {
                      ...node.properties,
                      'data-content-type': 'scheduled-delivery-link',
                      'data-scheduler-uuid': schedulerMatch[1],
                      href,
                  }
                : {
                      ...node.properties,
                      'data-content-type': matcher.contentType,
                      ...matcher.extractData(match),
                      href,
                  };
            return;
        }

        return;
    }

    node.properties = {
        ...node.properties,
        'data-content-type': processor.contentType,
        href: processor.cleanUrl(href),
        ...processor.extractData(href),
    };
};

/**
 * @description
 * This function is used to process links in the markdown content.
 * It will extract the data from the link and add it to the node properties.
 * It will also clean the href and add the data-content-type to the node properties.
 * This is used to process links in the markdown content for the AI Agent that are
 * links to dashboards or charts.
 * @returns {Root} - The processed tree.
 */
export const rehypeAiAgentContentLinks = () => (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
        if (node.tagName !== 'a') return;

        const href = node.properties?.href;
        if (typeof href === 'string') {
            processLink(node, href);
        }
    });
};
