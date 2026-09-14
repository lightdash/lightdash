import {
    AI_DEEP_RESEARCH_MARKDOWN_TAGS,
    renderDeepResearchChartRefs,
} from '@lightdash/common';
import {
    createContext,
    useContext,
    useMemo,
    type AnchorHTMLAttributes,
    type FC,
    type ReactNode,
} from 'react';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { type StreamdownProps } from 'streamdown';
import { AiMarkdown } from '../../../../../components/common/AiMarkdown/AiMarkdown';
import Callout from '../../../../../components/common/Callout';
import EmptyStateLoader from '../../../../../components/common/EmptyStateLoader';
import { useDeepResearchChartQuery } from '../../hooks/useDeepResearch';
import { DeepResearchChartTile } from './DeepResearchChartTile';
import styles from './DeepResearchReport.module.css';

const DeepResearchReportContext = createContext<{
    projectUuid: string;
    runUuid: string;
} | null>(null);

const CHART_HREF_PREFIX = '#chart-';

export const QueryBackedChart: FC<{
    projectUuid: string;
    runUuid: string;
    queryUuid: string;
    withExploreLink?: boolean;
}> = ({ projectUuid, runUuid, queryUuid, withExploreLink = true }) => {
    const chartQuery = useDeepResearchChartQuery({
        projectUuid,
        runUuid,
        queryUuid,
    });
    if (chartQuery.isLoading) {
        return <EmptyStateLoader title="Loading report chart" />;
    }
    if (!chartQuery.data) {
        return (
            <Callout variant="warning" title="Chart unavailable">
                This chart could not be displayed.
            </Callout>
        );
    }
    return (
        <DeepResearchChartTile
            chartKey={queryUuid}
            chart={chartQuery.data}
            projectUuid={projectUuid}
            runUuid={runUuid}
            withExploreLink={withExploreLink}
        />
    );
};

/**
 * Chart tags are converted to these internal links before rendering and
 * hydrate into chart tiles from the run's persisted chart metadata. Every other
 * link renders as a regular external anchor.
 */
const ReportLink: FC<AnchorHTMLAttributes<HTMLAnchorElement>> = ({
    href,
    children,
}) => {
    const context = useContext(DeepResearchReportContext);
    const linkHref = typeof href === 'string' ? href : undefined;

    if (linkHref?.startsWith(CHART_HREF_PREFIX)) {
        const chartKey = linkHref.slice(CHART_HREF_PREFIX.length);
        if (!context) {
            return (
                <Callout variant="warning" title="Chart unavailable">
                    This chart could not be displayed.
                </Callout>
            );
        }
        return (
            <QueryBackedChart
                projectUuid={context.projectUuid}
                runUuid={context.runUuid}
                queryUuid={chartKey}
            />
        );
    }

    return (
        <a href={linkHref} target="_blank" rel="noreferrer">
            {children as ReactNode}
        </a>
    );
};

// Streamdown's `allowedTags` prop cannot be used here: it rewrites blank
// lines inside whitelisted tags into HTML comments so the whole region
// becomes one raw HTML block, which stops markdown (lists, bold) inside
// callouts from being parsed. Wiring raw -> sanitize ourselves keeps the
// tag whitelist while letting the callout children parse as markdown.
const SANITIZE_SCHEMA = {
    ...defaultSchema,
    tagNames: [
        ...(defaultSchema.tagNames ?? []).filter(
            (tagName) => tagName !== 'img',
        ),
        ...Object.keys(AI_DEEP_RESEARCH_MARKDOWN_TAGS),
    ],
    attributes: {
        ...defaultSchema.attributes,
        ...AI_DEEP_RESEARCH_MARKDOWN_TAGS,
    },
};

const REHYPE_PLUGINS: StreamdownProps['rehypePlugins'] = [
    rehypeRaw,
    [rehypeSanitize, SANITIZE_SCHEMA],
];

// Custom tag props arrive untyped (and lowercased) from rehype-raw.
const renderCallout =
    (variant: 'info' | 'warning' | 'success', hideIcon = false) =>
    ({ children, title }: Record<string, unknown>) => (
        <Callout
            variant={variant}
            hideIcon={hideIcon}
            my="md"
            title={typeof title === 'string' ? title : undefined}
        >
            {children as ReactNode}
        </Callout>
    );

const MARKDOWN_COMPONENTS: StreamdownProps['components'] = {
    note: renderCallout('info', true),
    info: renderCallout('info'),
    warning: renderCallout('warning'),
    tip: renderCallout('success'),
    // The components map's custom-tag index signature and the `a` key demand
    // contradictory prop types; the runtime contract is plain anchor props.
    a: ReportLink as unknown as NonNullable<StreamdownProps['components']>['a'],
};

type Props = {
    markdown: string;
    projectUuid: string;
    runUuid: string;
    className?: string;
};

/**
 * Renders a deep research report markdown document as one linear flow:
 * prose via streamdown, <chart> references hydrated into
 * chart tiles from the run's chart metadata, and the whitelisted
 * callout tags mapped to house components.
 */
export const DeepResearchMarkdownReport: FC<Props> = ({
    markdown,
    projectUuid,
    runUuid,
    className = styles.reportBody,
}) => {
    const renderMarkdown = useMemo(
        () => renderDeepResearchChartRefs(markdown),
        [markdown],
    );
    const contextValue = useMemo(
        () => ({ projectUuid, runUuid }),
        [projectUuid, runUuid],
    );
    return (
        <DeepResearchReportContext.Provider value={contextValue}>
            <AiMarkdown
                className={className}
                rehypePlugins={REHYPE_PLUGINS}
                components={MARKDOWN_COMPONENTS}
            >
                {renderMarkdown}
            </AiMarkdown>
        </DeepResearchReportContext.Provider>
    );
};
