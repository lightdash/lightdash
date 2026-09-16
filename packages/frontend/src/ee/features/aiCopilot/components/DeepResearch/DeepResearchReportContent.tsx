import { type ParsedDeepResearchReport } from '@lightdash/common';
import { Box, Stack } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import ReportChartFrame from '../../../../../features/documents/presentation/ReportChartFrame';
import styles from '../../../../../features/documents/presentation/ReportPresentation.module.css';
import ReportSection from '../../../../../features/documents/presentation/ReportSection';
import { DeepResearchExploreLink } from './DeepResearchExploreLink';
import { DeepResearchInlineMarkdown } from './DeepResearchInlineMarkdown';
import {
    DeepResearchMarkdownReport,
    QueryBackedChart,
} from './DeepResearchMarkdownReport';

type Props = {
    report: ParsedDeepResearchReport;
    projectUuid: string;
    runUuid: string;
    renderEvidence?: (queryUuid: string) => ReactNode;
};

export const DeepResearchReportContent: FC<Props> = ({
    report,
    projectUuid,
    runUuid,
    renderEvidence,
}) => {
    const renderMarkdown = (markdown: string, className: string) => (
        <DeepResearchMarkdownReport
            markdown={markdown}
            projectUuid={projectUuid}
            runUuid={runUuid}
            className={className}
        />
    );

    return (
        <Stack className={styles.structuredReport}>
            <ReportSection variant="introduction">
                {renderMarkdown(
                    report.introductionMarkdown,
                    styles.reportIntroductionProse,
                )}
            </ReportSection>

            {report.findings.map((finding, index) => (
                <ReportSection
                    key={`${finding.title}-${index}`}
                    title={
                        <DeepResearchInlineMarkdown markdown={finding.title} />
                    }
                    actions={
                        finding.evidenceQueryUuid && !renderEvidence ? (
                            <DeepResearchExploreLink
                                projectUuid={projectUuid}
                                runUuid={runUuid}
                                queryUuid={finding.evidenceQueryUuid}
                            />
                        ) : undefined
                    }
                >
                    {finding.evidenceQueryUuid ? (
                        <>
                            {renderEvidence ? (
                                <ReportChartFrame>
                                    {renderEvidence(finding.evidenceQueryUuid)}
                                </ReportChartFrame>
                            ) : (
                                <QueryBackedChart
                                    projectUuid={projectUuid}
                                    runUuid={runUuid}
                                    queryUuid={finding.evidenceQueryUuid}
                                    withExploreLink={false}
                                />
                            )}
                        </>
                    ) : null}

                    <Box className={styles.reportNarrative}>
                        {renderMarkdown(
                            finding.interpretationMarkdown,
                            styles.reportProse,
                        )}
                    </Box>
                </ReportSection>
            ))}

            <ReportSection variant="conclusion" title="Conclusion">
                {renderMarkdown(
                    report.conclusionMarkdown,
                    styles.reportConclusionProse,
                )}
            </ReportSection>
        </Stack>
    );
};
