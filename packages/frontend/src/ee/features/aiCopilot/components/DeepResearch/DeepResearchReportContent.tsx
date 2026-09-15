import { type ParsedDeepResearchReport } from '@lightdash/common';
import { Box, Group, Stack, Title } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import ReportChartFrame from '../../../../../features/documents/presentation/ReportChartFrame';
import styles from '../../../../../features/documents/presentation/ReportPresentation.module.css';
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
            <Box className={styles.reportIntroduction}>
                {renderMarkdown(
                    report.introductionMarkdown,
                    styles.reportIntroductionProse,
                )}
            </Box>

            {report.findings.map((finding, index) => (
                <Box
                    component="section"
                    className={styles.reportFinding}
                    key={`${finding.title}-${index}`}
                >
                    <Group
                        justify="space-between"
                        align="baseline"
                        gap="md"
                        wrap="nowrap"
                    >
                        <Title order={2} className={styles.reportFindingTitle}>
                            <DeepResearchInlineMarkdown
                                markdown={finding.title}
                            />
                        </Title>
                        {finding.evidenceQueryUuid && !renderEvidence ? (
                            <DeepResearchExploreLink
                                projectUuid={projectUuid}
                                runUuid={runUuid}
                                queryUuid={finding.evidenceQueryUuid}
                            />
                        ) : null}
                    </Group>

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
                </Box>
            ))}

            <Box component="section" className={styles.reportConclusion}>
                <Title order={2} className={styles.reportFindingTitle}>
                    Conclusion
                </Title>
                {renderMarkdown(
                    report.conclusionMarkdown,
                    styles.reportConclusionProse,
                )}
            </Box>
        </Stack>
    );
};
