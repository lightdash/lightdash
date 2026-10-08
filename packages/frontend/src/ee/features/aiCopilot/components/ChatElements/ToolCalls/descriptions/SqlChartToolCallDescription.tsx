import { formatSql } from '@lightdash/common';
import { Box, Group, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconChartBar } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import CodeBlock from '../../../../../../../components/common/CodeBlock/CodeBlock';
import MantineIcon from '../../../../../../../components/common/MantineIcon';
import { useCanViewAiAgentSql } from '../../../../hooks/useCanViewAiAgentSql';
import { AiSqlModal } from '../../AiSqlModal';
import {
    SqlApprovalActions,
    SqlExpandButton,
    type SqlApprovalReview,
    type SqlApprovalTarget,
} from '../SqlApprovalCard';
import { ToolCallChip } from '../ToolCallChip';
import { useSqlAutoApprove } from '../useSqlAutoApprove';
import styles from './ComposerQueriesToolCallDescription.module.css';

export type SqlChartToolArgs = {
    name?: string;
    spaceSlug?: string;
    chartKind?: string;
    sql?: string;
};

type Props = {
    action: 'create' | 'edit';
    slug: string;
    chart: SqlChartToolArgs;
    /** Present while the SQL chart waits for the user to approve its SQL. */
    approval?: SqlApprovalTarget;
};

const CHART_KIND_LABELS: Record<string, string> = {
    vertical_bar: 'Bar chart',
    line: 'Line chart',
    pie: 'Pie chart',
    big_number: 'Big number',
    table: 'Table',
};

export const SqlChartToolCallDescription: FC<Props> = ({
    action,
    slug,
    chart,
    approval,
}) => {
    const canViewSql = useCanViewAiAgentSql();
    // Whoever approves the SQL has to see it.
    const showSql = (canViewSql || approval !== undefined) && !!chart.sql;
    const formattedSql = useMemo(
        () => (showSql && chart.sql ? formatSql(chart.sql) : null),
        [showSql, chart.sql],
    );
    const verb = action === 'create' ? 'Save' : 'Update';
    const autoApprove = useSqlAutoApprove(approval?.threadUuid ?? '');
    const [reviewOpened, { open: openReview, close: closeReview }] =
        useDisclosure(false);
    const chartName = chart.name ?? slug;
    const chartKindLabel = chart.chartKind
        ? (CHART_KIND_LABELS[chart.chartKind] ?? chart.chartKind)
        : null;
    const reviewSubtitle = [
        chartName,
        chart.spaceSlug ? `in ${chart.spaceSlug}` : null,
        chartKindLabel,
    ]
        .filter(Boolean)
        .join(' · ');
    const title = approval
        ? `${verb} SQL chart`
        : `${action === 'create' ? 'Created' : 'Edited'} SQL chart`;
    const review: SqlApprovalReview | null = formattedSql
        ? {
              opened: reviewOpened,
              onClose: closeReview,
              sql: formattedSql,
              title,
              icon: IconChartBar,
              subtitle: reviewSubtitle,
          }
        : null;

    return (
        <Stack gap={6} w="100%">
            <Group gap={6} wrap="nowrap" align="flex-start">
                <Group gap={6} wrap="wrap" align="center" flex={1}>
                    <MantineIcon icon={IconChartBar} size={13} stroke={1.6} />
                    <Text size="xs" c="dimmed">
                        {title}
                    </Text>
                    <ToolCallChip>{chartName}</ToolCallChip>
                    {chart.spaceSlug ? (
                        <>
                            <Text size="xs" c="dimmed">
                                in
                            </Text>
                            <ToolCallChip>{chart.spaceSlug}</ToolCallChip>
                        </>
                    ) : null}
                    {chartKindLabel ? (
                        <ToolCallChip>{chartKindLabel}</ToolCallChip>
                    ) : null}
                </Group>
                {review && !(approval && autoApprove) ? (
                    <SqlExpandButton onClick={openReview} />
                ) : null}
            </Group>
            {formattedSql ? (
                <Box className={styles.code}>
                    <CodeBlock code={formattedSql} language="sql" />
                </Box>
            ) : null}
            {approval ? (
                <SqlApprovalActions {...approval} review={review} />
            ) : review ? (
                <AiSqlModal {...review} copyPlacement="inline" />
            ) : null}
        </Stack>
    );
};
