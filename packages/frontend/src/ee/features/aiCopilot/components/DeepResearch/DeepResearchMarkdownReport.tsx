import {
    AI_DEEP_RESEARCH_MARKDOWN_TAGS,
    type AiDeepResearchChartDataMap,
    type AiDeepResearchConfidence,
} from '@lightdash/common';
import { Badge, Group, Text } from '@mantine-8/core';
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
import { DeepResearchChartTile } from './DeepResearchChartTile';
import styles from './DeepResearchReport.module.css';

const DeepResearchReportContext = createContext<{
    projectUuid: string;
    runUuid: string;
    chartData: AiDeepResearchChartDataMap | null;
} | null>(null);

const CONFIDENCE_COLORS: Record<AiDeepResearchConfidence, string> = {
    low: 'red',
    medium: 'yellow',
    high: 'green',
};

const isConfidenceLevel = (value: unknown): value is AiDeepResearchConfidence =>
    value === 'low' || value === 'medium' || value === 'high';

const ConfidenceBadge: FC<{ level: unknown; children?: ReactNode }> = ({
    level,
    children,
}) => {
    if (!isConfidenceLevel(level)) {
        return null;
    }
    return (
        <Group gap="xs" align="center" my={4}>
            <Badge
                size="xs"
                variant="light"
                color={CONFIDENCE_COLORS[level]}
                tt="none"
            >
                {level} confidence
            </Badge>
            {children && (
                <Text size="xs" c="dimmed" component="span">
                    {children}
                </Text>
            )}
        </Group>
    );
};

const CHART_HREF_PREFIX = '#chart-';

/**
 * Chart references arrive as plain links, [Title](#chart-<key>), and hydrate
 * into chart tiles from the run's persisted chart data. Every other link
 * renders as a regular external anchor.
 */
const ReportLink: FC<AnchorHTMLAttributes<HTMLAnchorElement>> = ({
    href,
    children,
}) => {
    const context = useContext(DeepResearchReportContext);
    const linkHref = typeof href === 'string' ? href : undefined;

    if (linkHref?.startsWith(CHART_HREF_PREFIX)) {
        const chartKey = linkHref.slice(CHART_HREF_PREFIX.length);
        const chart = context?.chartData?.[chartKey];
        if (!context || !chart) {
            return (
                <Callout variant="warning" title="Chart unavailable">
                    This chart could not be displayed.
                </Callout>
            );
        }
        return (
            <DeepResearchChartTile
                chartKey={chartKey}
                chart={chart}
                projectUuid={context.projectUuid}
                runUuid={context.runUuid}
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
        ...(defaultSchema.tagNames ?? []),
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
    confidence: ({ children, level }: Record<string, unknown>) => (
        <ConfidenceBadge level={level}>{children as ReactNode}</ConfidenceBadge>
    ),
    // The components map's custom-tag index signature and the `a` key demand
    // contradictory prop types; the runtime contract is plain anchor props.
    a: ReportLink as unknown as NonNullable<StreamdownProps['components']>['a'],
};

type Props = {
    markdown: string;
    chartData: AiDeepResearchChartDataMap | null;
    projectUuid: string;
    runUuid: string;
};

/**
 * Renders a deep research report markdown document as one linear flow:
 * prose via streamdown, [title](#chart-<key>) references hydrated into
 * chart tiles from the run's chart data, and the whitelisted
 * callout/confidence tags mapped to house components.
 */
export const DeepResearchMarkdownReport: FC<Props> = ({
    markdown,
    chartData,
    projectUuid,
    runUuid,
}) => {
    const contextValue = useMemo(
        () => ({ projectUuid, runUuid, chartData }),
        [projectUuid, runUuid, chartData],
    );
    return (
        <DeepResearchReportContext.Provider value={contextValue}>
            <AiMarkdown
                className={styles.reportBody}
                rehypePlugins={REHYPE_PLUGINS}
                components={MARKDOWN_COMPONENTS}
            >
                {markdown}
            </AiMarkdown>
        </DeepResearchReportContext.Provider>
    );
};
