import { SQL_CHART_KINDS, type SqlChartKind } from '@lightdash/common';
import { Group, Stack, Text } from '@mantine/core';
import { IconChartBar } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../../../components/common/MantineIcon';
import { useCanViewAiAgentSql } from '../../../../hooks/useCanViewAiAgentSql';
import {
    SqlApprovalActions,
    type SqlApprovalTarget,
} from '../SqlApprovalActions';
import { ToolCallChip } from '../ToolCallChip';
import { ToolCallSqlBlock } from '../ToolCallSqlBlock';

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

const CHART_KIND_LABELS: Record<SqlChartKind, string> = {
    vertical_bar: 'Bar chart',
    line: 'Line chart',
    pie: 'Pie chart',
    big_number: 'Big number',
    table: 'Table',
};

const isSqlChartKind = (value: string): value is SqlChartKind =>
    (SQL_CHART_KINDS as readonly string[]).includes(value);

export const SqlChartToolCallDescription: FC<Props> = ({
    action,
    slug,
    chart,
    approval,
}) => {
    const canViewSql = useCanViewAiAgentSql();
    // Whoever approves the SQL has to see it.
    const showSql = (canViewSql || approval !== null) && !!chart.sql;
    const verb = action === 'create' ? 'Save' : 'Update';

    return (
        <Stack gap={6} w="100%">
            <Group gap={6} wrap="wrap" align="center">
                <MantineIcon icon={IconChartBar} size={13} stroke={1.6} />
                <Text size="xs" c="dimmed">
                    {approval
                        ? `${verb} SQL chart`
                        : `${action === 'create' ? 'Created' : 'Edited'} SQL chart`}
                </Text>
                <ToolCallChip>{chart.name ?? slug}</ToolCallChip>
                {chart.spaceSlug ? (
                    <>
                        <Text size="xs" c="dimmed">
                            in
                        </Text>
                        <ToolCallChip>{chart.spaceSlug}</ToolCallChip>
                    </>
                ) : null}
                {chart.chartKind ? (
                    <ToolCallChip>
                        {isSqlChartKind(chart.chartKind)
                            ? CHART_KIND_LABELS[chart.chartKind]
                            : chart.chartKind}
                    </ToolCallChip>
                ) : null}
            </Group>
            {showSql && chart.sql ? <ToolCallSqlBlock sql={chart.sql} /> : null}
            {approval ? <SqlApprovalActions {...approval} /> : null}
        </Stack>
    );
};
