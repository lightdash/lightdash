import {
    Box,
    Button,
    Drawer,
    Group,
    ScrollArea,
    Stack,
    TableOfContents,
    Text,
    Title,
} from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NAVBAR_HEIGHT } from '../../../../../components/common/Page/constants';
import {
    getDeepResearchReportHeadings,
    getDeepResearchReportSourceCount,
} from '../../deepResearch/reportDocument';
import { type DeepResearchRunView } from '../../deepResearch/types';
import { DeepResearchMarkdownReport } from './DeepResearchMarkdownReport';
import styles from './DeepResearchReport.module.css';

type Props = {
    run: DeepResearchRunView;
    opened: boolean;
    onClose: () => void;
};

export const DeepResearchReport = ({ run, opened, onClose }: Props) => {
    const reportRef = useRef<HTMLElement | null>(null);
    const scrollViewportRef = useRef<HTMLDivElement | null>(null);
    const reinitializeContents = useRef<() => void>(() => undefined);
    const [activeSection, setActiveSection] = useState('report-summary');
    const reportHeadings = useMemo(
        () =>
            run.resultMarkdown
                ? getDeepResearchReportHeadings(run.resultMarkdown)
                : [],
        [run.resultMarkdown],
    );
    const contents = useMemo(
        () => [
            { id: 'report-summary', value: 'Summary', depth: 1 },
            ...reportHeadings,
        ],
        [reportHeadings],
    );
    const updateActiveSection = useCallback(() => {
        if (!reportRef.current || !scrollViewportRef.current) {
            return;
        }
        const viewport = scrollViewportRef.current;
        const viewportTop = viewport.getBoundingClientRect().top;
        const headings = [
            ...reportRef.current.querySelectorAll<HTMLElement>(
                '[data-report-heading]',
            ),
        ];
        const active = headings
            .filter(
                (heading) =>
                    heading.getBoundingClientRect().top - viewportTop <= 48,
            )
            .at(-1);
        const isAtEnd =
            viewport.scrollHeight -
                viewport.scrollTop -
                viewport.clientHeight <=
            2;

        setActiveSection(
            isAtEnd
                ? (headings.at(-1)?.id ?? 'report-summary')
                : (active?.id ?? 'report-summary'),
        );
    }, []);

    useEffect(() => {
        if (!opened) {
            return undefined;
        }
        const frame = window.requestAnimationFrame(() => {
            const headings =
                reportRef.current?.querySelectorAll<HTMLElement>('h2') ?? [];
            headings.forEach((heading, index) => {
                const data = reportHeadings[index];
                if (data) {
                    heading.id = data.id;
                    heading.dataset.reportHeading = '';
                    heading.dataset.headingLabel = data.value;
                }
            });
            reinitializeContents.current();
        });
        return () => window.cancelAnimationFrame(frame);
    }, [opened, reportHeadings]);

    if (!run.resultMarkdown) {
        return null;
    }

    const sourceCount =
        run.sourceCount ??
        getDeepResearchReportSourceCount(run.resultMarkdown) ??
        '—';

    return (
        <Drawer
            opened={opened}
            onClose={onClose}
            title={
                <Group className={styles.reportControls} wrap="nowrap">
                    <Text className={styles.visuallyHidden}>Deep research</Text>
                    <Button
                        variant="subtle"
                        color="gray"
                        radius="xl"
                        size="xs"
                        leftSection={<IconArrowLeft size={14} />}
                        onClick={onClose}
                    >
                        Back to chat
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
            <ScrollArea
                className={styles.reportScroll}
                viewportRef={scrollViewportRef}
                onScrollPositionChange={updateActiveSection}
            >
                <Box className={styles.reportLayout}>
                    <Box component="aside" className={styles.contentsRail}>
                        <Box
                            component="nav"
                            className={styles.contentsNav}
                            aria-label="Report contents"
                        >
                            <Text className={styles.contentsLabel}>
                                Contents
                            </Text>
                            <TableOfContents
                                variant="light"
                                color="gray"
                                size="xs"
                                radius="sm"
                                initialData={contents}
                                reinitializeRef={reinitializeContents}
                                minDepthToOffset={1}
                                classNames={{
                                    root: styles.contentsList,
                                    control: styles.contentsControl,
                                }}
                                scrollSpyOptions={{
                                    selector:
                                        '[data-deep-research-report] [data-report-heading]',
                                    getDepth: () => 1,
                                    getValue: (element) =>
                                        element.dataset.headingLabel ?? '',
                                }}
                                getControlProps={({ data }) => ({
                                    onClick: () => {
                                        setActiveSection(data.id);
                                        data.getNode().scrollIntoView({
                                            block: 'start',
                                        });
                                    },
                                    children:
                                        data.value === 'Sources' ? (
                                            <Group gap={5} wrap="nowrap">
                                                <span>Sources</span>
                                                <Text
                                                    component="span"
                                                    className={
                                                        styles.sourceCount
                                                    }
                                                >
                                                    {sourceCount}
                                                </Text>
                                            </Group>
                                        ) : (
                                            data.value
                                        ),
                                    title: data.value,
                                    'data-active':
                                        data.id === activeSection || undefined,
                                    'aria-current':
                                        data.id === activeSection
                                            ? 'location'
                                            : undefined,
                                })}
                            />
                        </Box>
                    </Box>
                    <Box
                        component="article"
                        ref={reportRef}
                        className={styles.report}
                        data-deep-research-report
                    >
                        <Stack gap="xl">
                            <Box
                                component="header"
                                id="report-summary"
                                className={styles.reportHeader}
                                data-report-heading
                                data-heading-label="Summary"
                            >
                                <Text className={styles.eyebrow}>
                                    Deep research
                                </Text>
                                <Title order={1} className={styles.reportTitle}>
                                    {run.question}
                                </Title>
                            </Box>
                            <DeepResearchMarkdownReport
                                markdown={run.resultMarkdown}
                                projectUuid={run.projectUuid}
                                runUuid={run.uuid}
                                reportRunAt={
                                    run.completedAt ??
                                    run.startedAt ??
                                    run.updatedAt
                                }
                            />
                        </Stack>
                    </Box>
                </Box>
            </ScrollArea>
        </Drawer>
    );
};
