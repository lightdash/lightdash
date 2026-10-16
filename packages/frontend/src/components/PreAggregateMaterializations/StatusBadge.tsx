import { type PreAggregateMaterializationSummary } from '@lightdash/common';
import { Badge, Tooltip } from '@mantine/core';
import { IconDatabaseExport } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../common/MantineIcon';

export const StatusBadge: FC<{
    summary: PreAggregateMaterializationSummary;
}> = ({ summary }) => {
    const { t } = useTranslation('app');
    if (summary.definitionError) {
        return (
            <Tooltip label={summary.definitionError} maw={300}>
                <Badge color="red" size="sm">
                    {t('preAggregateMaterializations.definitionError')}
                </Badge>
            </Tooltip>
        );
    }

    if (summary.externalTable) {
        return (
            <Tooltip label={t('preAggregateMaterializations.externalTooltip')}>
                <Badge
                    color="indigo"
                    size="sm"
                    leftSection={
                        <MantineIcon icon={IconDatabaseExport} size="xs" />
                    }
                >
                    {t('preAggregateMaterializations.status.external')}
                </Badge>
            </Tooltip>
        );
    }

    if (!summary.materialization) {
        return (
            <Badge size="sm">
                {t('preAggregateMaterializations.status.never_materialized')}
            </Badge>
        );
    }

    const { status, errorMessage } = summary.materialization;

    switch (status) {
        case 'active':
            return (
                <Badge color="green" size="sm">
                    {t('preAggregateMaterializations.status.active')}
                </Badge>
            );
        case 'in_progress':
            return (
                <Badge color="blue" size="sm">
                    {t('preAggregateMaterializations.status.in_progress')}
                </Badge>
            );
        case 'failed':
            return (
                <Tooltip
                    label={
                        errorMessage ??
                        t('preAggregateMaterializations.unknownError')
                    }
                    maw={300}
                >
                    <Badge color="red" size="sm">
                        {t('preAggregateMaterializations.status.failed')}
                    </Badge>
                </Tooltip>
            );
        case 'superseded':
            return (
                <Badge size="sm">
                    {t('preAggregateMaterializations.status.superseded')}
                </Badge>
            );
        default:
            return <Badge size="sm">{status}</Badge>;
    }
};
