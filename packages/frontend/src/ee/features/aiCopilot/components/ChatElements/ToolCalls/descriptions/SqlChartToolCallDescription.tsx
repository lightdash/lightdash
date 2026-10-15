import {
    assertUnreachable,
    SQL_CHART_KINDS,
    type SqlChartKind,
} from '@lightdash/common';
import { Group, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconChartBar } from '@tabler/icons-react';
import { type TFunction } from 'i18next';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../../../../../components/common/MantineIcon';
import { useCanViewAiAgentSql } from '../../../../hooks/useCanViewAiAgentSql';
import { AiSqlModal } from '../../AiSqlModal';
import {
    SqlApprovalActions,
    SqlExpandButton,
    type SqlApprovalReview,
    type SqlApprovalTarget,
} from '../SqlApprovalActions';
import { ToolCallChip } from '../ToolCallChip';
import { ToolCallSqlBlock } from '../ToolCallSqlBlock';
import { useSqlAutoApprove } from '../useSqlAutoApprove';

export type SqlChartToolArgs = {
    name?: string;
    spaceSlug?: string;
    chartKind?: SqlChartKind;
    sql?: string;
};

type Props = {
    action: 'create' | 'edit';
    slug: string;
    chart: SqlChartToolArgs;
    /** Set while the SQL chart waits for the user to approve its SQL. */
    approval: SqlApprovalTarget | null;
};

const getChartKindLabel = (kind: SqlChartKind, t: TFunction): string => {
    switch (kind) {
        case 'vertical_bar':
            return t('sqlChart.kinds.bar');
        case 'line':
            return t('sqlChart.kinds.line');
        case 'pie':
            return t('sqlChart.kinds.pie');
        case 'big_number':
            return t('sqlChart.kinds.bigNumber');
        case 'table':
            return t('sqlChart.kinds.table');
        default:
            return assertUnreachable(kind, 'Unknown SQL chart kind');
    }
};

const isSqlChartKind = (value: string): value is SqlChartKind =>
    (SQL_CHART_KINDS as readonly string[]).includes(value);

export const SqlChartToolCallDescription: FC<Props> = ({
    action,
    slug,
    chart,
    approval,
}) => {
    const { t } = useTranslation('aiCopilotChat');
    const canViewSql = useCanViewAiAgentSql();
    // Whoever approves the SQL has to see it.
    const showSql = (canViewSql || approval !== null) && !!chart.sql;
    const autoApprove = useSqlAutoApprove(
        approval ? approval.threadUuid : null,
    );
    const [reviewOpened, { open: openReview, close: closeReview }] =
        useDisclosure(false);
    const chartName = chart.name ?? slug;
    const chartKindLabel = chart.chartKind
        ? isSqlChartKind(chart.chartKind)
            ? getChartKindLabel(chart.chartKind, t)
            : chart.chartKind
        : null;
    const reviewSubtitle = [
        chartName,
        chart.spaceSlug
            ? t('sqlChart.inSpace', { space: chart.spaceSlug })
            : null,
        chartKindLabel,
    ]
        .filter(Boolean)
        .join(' · ');
    const title = approval
        ? action === 'create'
            ? t('sqlChart.save')
            : t('sqlChart.update')
        : action === 'create'
          ? t('sqlChart.created')
          : t('sqlChart.edited');
    const review: SqlApprovalReview | null =
        showSql && chart.sql
            ? {
                  opened: reviewOpened,
                  onClose: closeReview,
                  sql: chart.sql,
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
                                {t('toolDescriptions.in')}
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
            {showSql && chart.sql ? <ToolCallSqlBlock sql={chart.sql} /> : null}
            {approval ? (
                <SqlApprovalActions {...approval} review={review} />
            ) : review ? (
                <AiSqlModal {...review} copyPlacement="inline" />
            ) : null}
        </Stack>
    );
};
