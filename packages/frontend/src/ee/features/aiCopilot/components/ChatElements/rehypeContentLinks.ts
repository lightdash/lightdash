import { type Element, type Root } from 'hast';
import { visit } from 'unist-util-visit';

type ContentType = 'dashboard-link' | 'chart-link' | 'artifact-link';

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
];

const processLink = (node: Element, href: string): void => {
    const processor = LINK_PROCESSORS.find((p) => href.includes(p.fragment));
    if (!processor) return;

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
