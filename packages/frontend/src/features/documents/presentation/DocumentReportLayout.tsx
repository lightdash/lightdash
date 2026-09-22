import {
    Box,
    Group,
    ScrollArea,
    Stack,
    Text,
    Title,
    UnstyledButton,
} from '@mantine/core';
import type { HTMLAttributes, ReactNode } from 'react';
import styles from './ReportPresentation.module.css';
import { useReportContents } from './useReportContents';

export type ReportHeading = { id: string; label: string; badge?: ReactNode };

type Props = {
    title: ReactNode;
    eyebrow?: ReactNode;
    description?: ReactNode;
    headings: ReportHeading[];
    contentsLabel?: ReactNode;
    children: ReactNode;
    headerProps?: HTMLAttributes<HTMLHeadingElement> & {
        [key: `data-${string}`]: string;
    };
    headingSelector?: string;
    variant?: 'structured' | 'markdown' | 'document';
    actions?: ReactNode;
    metadata?: ReactNode;
};

const DocumentReportLayout = ({
    title,
    eyebrow,
    description,
    headings,
    contentsLabel = 'Contents',
    children,
    headerProps,
    headingSelector,
    variant = 'structured',
    actions,
    metadata,
}: Props) => {
    const contents = useReportContents(headings, headingSelector);
    const entries = [
        { id: null, label: 'Summary', badge: undefined },
        ...headings,
    ];

    return (
        <ScrollArea
            className={styles.reportScroll}
            viewportRef={contents.viewportRef}
            onScrollPositionChange={contents.updateActiveSection}
        >
            <Box
                className={[
                    styles.reportLayout,
                    variant !== 'markdown' && styles.structuredReportLayout,
                    variant === 'document' && styles.documentLayout,
                ]
                    .filter(Boolean)
                    .join(' ')}
            >
                <Box component="aside" className={styles.contentsRail}>
                    <Box
                        component="nav"
                        className={styles.contentsNav}
                        aria-label="Report contents"
                    >
                        {contentsLabel && (
                            <Text className={styles.contentsLabel}>
                                {contentsLabel}
                            </Text>
                        )}
                        <Box className={styles.contentsList}>
                            {entries.map((heading) => (
                                <UnstyledButton
                                    key={heading.id ?? 'summary'}
                                    className={styles.contentsControl}
                                    title={heading.label}
                                    aria-label={heading.label}
                                    data-active={
                                        contents.activeSection === heading.id ||
                                        undefined
                                    }
                                    aria-current={
                                        contents.activeSection === heading.id
                                            ? 'location'
                                            : undefined
                                    }
                                    onClick={() =>
                                        contents.scrollToHeading(heading.id)
                                    }
                                >
                                    {heading.badge !== undefined ? (
                                        <Group gap={5} wrap="nowrap">
                                            <span>{heading.label}</span>
                                            <Text
                                                component="span"
                                                className={styles.sourceCount}
                                            >
                                                {heading.badge}
                                            </Text>
                                        </Group>
                                    ) : (
                                        heading.label
                                    )}
                                </UnstyledButton>
                            ))}
                        </Box>
                    </Box>
                </Box>
                <Box
                    component="article"
                    className={[
                        styles.report,
                        variant !== 'markdown'
                            ? styles.structuredReportPage
                            : styles.reportFallback,
                    ].join(' ')}
                >
                    <Stack gap="xl" className={styles.reportContent}>
                        <Box
                            component="header"
                            ref={contents.headerRef}
                            className={styles.reportHeader}
                        >
                            {eyebrow && (
                                <Box className={styles.eyebrow}>{eyebrow}</Box>
                            )}
                            <Box className={styles.reportTitleRow}>
                                <Title
                                    order={1}
                                    className={styles.reportTitle}
                                    {...headerProps}
                                >
                                    {title}
                                </Title>
                                {actions && (
                                    <Box className={styles.reportActions}>
                                        {actions}
                                    </Box>
                                )}
                            </Box>
                            {metadata}
                            {description && (
                                <Box className={styles.reportProse}>
                                    {description}
                                </Box>
                            )}
                        </Box>
                        <Box ref={contents.bodyRef}>{children}</Box>
                    </Stack>
                </Box>
            </Box>
        </ScrollArea>
    );
};

export default DocumentReportLayout;
