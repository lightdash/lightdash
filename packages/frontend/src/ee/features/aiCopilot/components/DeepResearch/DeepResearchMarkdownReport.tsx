import { renderDeepResearchChartRefs } from '@lightdash/common';
import {
    createContext,
    useContext,
    useMemo,
    type AnchorHTMLAttributes,
    type FC,
    type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { type StreamdownProps } from 'streamdown';
import Callout from '../../../../../components/common/Callout';
import EmptyStateLoader from '../../../../../components/common/EmptyStateLoader';
import ReportChartFrame from '../../../../../features/documents/presentation/ReportChartFrame';
import ReportMarkdown from '../../../../../features/documents/presentation/ReportMarkdown';
import styles from '../../../../../features/documents/presentation/ReportPresentation.module.css';
import { useDeepResearchChartQuery } from '../../hooks/useDeepResearch';
import { DeepResearchChartTile } from './DeepResearchChartTile';

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
    const { t } = useTranslation('aiAgent');
    const chartQuery = useDeepResearchChartQuery({
        projectUuid,
        runUuid,
        queryUuid,
    });
    if (chartQuery.isLoading) {
        return (
            <ReportChartFrame>
                <EmptyStateLoader
                    title={t('deepResearch.loadingReportChart')}
                />
            </ReportChartFrame>
        );
    }
    if (!chartQuery.data) {
        return (
            <ReportChartFrame>
                <Callout
                    variant="warning"
                    title={t('deepResearch.chartUnavailable')}
                >
                    {t('deepResearch.chartCouldNotDisplay')}
                </Callout>
            </ReportChartFrame>
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
    const { t } = useTranslation('aiAgent');
    const context = useContext(DeepResearchReportContext);
    const linkHref = typeof href === 'string' ? href : undefined;

    if (linkHref?.startsWith(CHART_HREF_PREFIX)) {
        const chartKey = linkHref.slice(CHART_HREF_PREFIX.length);
        if (!context) {
            return (
                <Callout
                    variant="warning"
                    title={t('deepResearch.chartUnavailable')}
                >
                    {t('deepResearch.chartCouldNotDisplay')}
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

const MARKDOWN_COMPONENTS: StreamdownProps['components'] = {
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
            <ReportMarkdown
                className={className}
                components={MARKDOWN_COMPONENTS}
                markdown={renderMarkdown}
            />
        </DeepResearchReportContext.Provider>
    );
};
