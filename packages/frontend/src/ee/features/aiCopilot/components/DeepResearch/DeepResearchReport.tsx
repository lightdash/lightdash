import { parseDeepResearchReport } from '@lightdash/common';
import { Button, Drawer, Group, Text } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { NAVBAR_HEIGHT } from '../../../../../components/common/Page/constants';
import DocumentReportLayout from '../../../../../features/documents/presentation/DocumentReportLayout';
import reportStyles from '../../../../../features/documents/presentation/ReportPresentation.module.css';
import { DeepResearchBetaBadge } from '../../deepResearch/DeepResearchBetaBadge';
import {
    getDeepResearchReportHeadings,
    getDeepResearchReportSourceCount,
} from '../../deepResearch/reportDocument';
import { type DeepResearchReportView } from '../../deepResearch/types';
import { DeepResearchInlineMarkdown } from './DeepResearchInlineMarkdown';
import { DeepResearchMarkdownReport } from './DeepResearchMarkdownReport';
import styles from './DeepResearchReport.module.css';
import { DeepResearchReportContent } from './DeepResearchReportContent';

type Props = {
    run: DeepResearchReportView;
    opened: boolean;
    onClose: () => void;
};

/**
 * Walkthrough result for create:AiDeepResearch: a finished report, the
 * seeded one, opened from its run card.
 */
const reportTourProps = {
    'data-tour-scope': 'create:AiDeepResearch',
    'data-tour-step': '1',
    'data-tour-route':
        '/projects/:projectUuid/ai-agents/deep-research/:runUuid',
    'data-tour-label': 'A report written from verified queries',
    'data-tour-docs': 'agents/deep-research.mdx#when-to-use-deep-research:1',
    'data-tour-return': 'none',
    'data-tour-resultdocs': 'agents/deep-research.mdx#read-the-report:1-2',
};

export const DeepResearchReport = ({ run, opened, onClose }: Props) => {
    const { t } = useTranslation('aiAgent');
    const parsedReport = useMemo(
        () =>
            run.resultMarkdown
                ? parseDeepResearchReport(run.resultMarkdown)
                : null,
        [run.resultMarkdown],
    );
    const headings = useMemo(() => {
        if (!run.resultMarkdown) {
            return [];
        }
        const sourceCount =
            run.sourceCount ??
            getDeepResearchReportSourceCount(run.resultMarkdown) ??
            '—';
        return getDeepResearchReportHeadings(run.resultMarkdown).map(
            (heading) => ({
                id: heading.id,
                label: heading.value,
                badge: heading.value === 'Sources' ? sourceCount : undefined,
            }),
        );
    }, [run.resultMarkdown, run.sourceCount]);
    if (!run.resultMarkdown || !run.completedAt) {
        return null;
    }
    return (
        <Drawer
            opened={opened}
            onClose={onClose}
            title={
                <Group className={reportStyles.reportControls} wrap="nowrap">
                    <Text className={styles.visuallyHidden}>
                        {t('deepResearch.eyebrow')}
                    </Text>
                    <Button
                        variant="subtle"
                        color="gray"
                        radius="xl"
                        size="xs"
                        leftSection={<IconArrowLeft size={14} />}
                        onClick={onClose}
                    >
                        {t('deepResearch.backToChat')}
                    </Button>
                </Group>
            }
            withCloseButton={false}
            position="right"
            size="100%"
            padding={0}
            classNames={{
                inner: styles.drawerInner,
                overlay: styles.drawerOverlay,
                header: styles.drawerHeader,
                title: styles.drawerTitle,
            }}
            __vars={{ '--drawer-top-offset': `${NAVBAR_HEIGHT}px` }}
        >
            <DocumentReportLayout
                title={
                    parsedReport ? (
                        <DeepResearchInlineMarkdown
                            markdown={parsedReport.title}
                        />
                    ) : (
                        run.question
                    )
                }
                eyebrow={
                    <Group gap="xs" align="baseline" wrap="wrap">
                        <Text inherit className={styles.eyebrow}>
                            {t('deepResearch.eyebrow')}
                        </Text>
                        <DeepResearchBetaBadge />
                    </Group>
                }
                headings={headings}
                headingSelector="h2"
                headerProps={reportTourProps}
                variant={parsedReport ? 'structured' : 'markdown'}
            >
                {parsedReport ? (
                    <DeepResearchReportContent
                        report={parsedReport}
                        projectUuid={run.projectUuid}
                        runUuid={run.uuid}
                    />
                ) : (
                    <DeepResearchMarkdownReport
                        markdown={run.resultMarkdown}
                        projectUuid={run.projectUuid}
                        runUuid={run.uuid}
                    />
                )}
            </DocumentReportLayout>
        </Drawer>
    );
};
