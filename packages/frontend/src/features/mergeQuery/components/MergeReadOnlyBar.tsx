import { MergeJoinType } from '@lightdash/common';
import { Box, Group, Paper, Text, ThemeIcon } from '@mantine/core';
import { IconArrowMerge } from '@tabler/icons-react';
import { type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import MantineIcon from '../../../components/common/MantineIcon';
import { PRIMARY_SOURCE_ID } from '../constants';
import { useMergeSafe } from '../context/useMerge';
import { useMergeSetup } from '../hooks/useMergeSetup';
import { getJoinClauseLabel } from './mergeJoinLabels';

/**
 * One line for the saved-chart view: what this chart is merged with and on
 * what. The view opens with the sidebar closed, so without this a viewer has
 * merged numbers with nothing saying where half of them came from.
 */
export const MergeReadOnlyBar: FC = () => {
    const { t } = useTranslation('mergeQuery');
    const merge = useMergeSafe();
    const {
        effectiveParts,
        labelFor,
        primaryExploreLabel,
        additionalExploreLabel,
        additionalSourceId,
        isIncomplete,
    } = useMergeSetup();

    if (!merge?.isMerging || !merge.readOnly || isIncomplete) return null;

    const keys = effectiveParts
        .map((part) => {
            const primaryFieldId = part.fieldIdBySourceId[PRIMARY_SOURCE_ID];
            const additionalFieldId =
                part.fieldIdBySourceId[additionalSourceId];
            const primaryField = primaryFieldId
                ? labelFor(primaryFieldId)
                : '?';
            const additionalField = additionalFieldId
                ? labelFor(additionalFieldId)
                : '?';

            return getJoinClauseLabel(
                primaryExploreLabel ?? t('labels.firstData'),
                primaryField,
                additionalExploreLabel ?? t('labels.combinedData'),
                additionalField,
            );
        })
        .join(` ${t('labels.and')} `);
    const keepLabel =
        merge.joinType === MergeJoinType.LEFT
            ? t('readOnlyBar.keep', { label: primaryExploreLabel })
            : merge.joinType === MergeJoinType.INNER
              ? t('readOnlyBar.matchesOnly')
              : t('readOnlyBar.keepAllRows');
    const runError = merge.mergeResults?.results.error ?? null;

    return (
        <Paper radius="md" px="sm" py="xs">
            <Group gap="sm" wrap="nowrap">
                <ThemeIcon variant="light" color="gray" radius="md" size="md">
                    <MantineIcon
                        icon={IconArrowMerge}
                        color="gray.7"
                        size={14}
                    />
                </ThemeIcon>
                <Box flex={1} miw={0}>
                    <Group gap={6} wrap="nowrap">
                        <Text size="sm" fw={600} truncate>
                            {primaryExploreLabel}
                        </Text>
                        <Text size="xs" c="dimmed">
                            +
                        </Text>
                        <Text size="sm" fw={600} truncate>
                            {additionalExploreLabel}
                        </Text>
                    </Group>
                    <Text size="xs" c="dimmed" truncate>
                        <Trans
                            t={t}
                            i18nKey="readOnlyBar.matchedOn"
                            values={{ keys, keep: keepLabel }}
                            components={{
                                bold: (
                                    <Text span size="xs" fw={600} c="gray.7" />
                                ),
                            }}
                        />
                    </Text>
                </Box>
                {runError && (
                    <Text size="xs" c="orange.8" truncate>
                        {runError.error?.message ?? t('readOnlyBar.runFailed')}
                    </Text>
                )}
            </Group>
        </Paper>
    );
};
