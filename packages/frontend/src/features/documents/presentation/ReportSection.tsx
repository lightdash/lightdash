import { Group, Title } from '@mantine/core';
import type { ReactNode } from 'react';
import styles from './ReportPresentation.module.css';

type HeadingProps = {
    children: ReactNode;
    id?: string;
    order?: 1 | 2;
    actions?: ReactNode;
    standalone?: boolean;
};

export const ReportSectionHeading = ({
    children,
    id,
    order = 2,
    actions,
    standalone = false,
}: HeadingProps) => (
    <Group
        justify="space-between"
        align="baseline"
        gap="md"
        wrap="nowrap"
        className={standalone ? styles.reportMarkdownHeading : undefined}
    >
        <Title
            order={order}
            className={styles.reportFindingTitle}
            id={id}
            data-report-heading={id ? '' : undefined}
        >
            {children}
        </Title>
        {actions}
    </Group>
);
