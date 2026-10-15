import { Box, Button, Group, Loader, Stack, Text } from '@mantine/core';
import {
    IconChartBar,
    IconChevronDown,
    IconFlask,
    IconRefresh,
    IconTable,
} from '@tabler/icons-react';
import { formatDistanceToNow } from 'date-fns';
import { type TFunction } from 'i18next';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../components/common/MantineIcon';
import { PolymorphicGroupButton } from '../../../components/common/PolymorphicGroupButton';
import { useSuggestedChartTypeExplore } from '../../../ee/features/ambientAi/hooks/useChartTypeSuggestions';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { getDateFnsLocale } from '../../../i18n/dateLocale';
import DataSourcePicker from './DataSourcePicker';
import classes from './DataSourceSection.module.css';
import {
    exploreQueryMeta,
    type AttachedExplore,
    type ExploreSourceControls,
} from './exploreSource';
import {
    type AttachedSavedChart,
    type SavedChartSourceControls,
} from './savedChartSource';

type Props = {
    savedChartSource: SavedChartSourceControls | null;
    exploreSource: ExploreSourceControls | null;
};

type TileState = {
    icon: typeof IconFlask;
    isAccent: boolean;
    title: string;
    meta: string;
    isRunning: boolean;
    failure: { message: string; retry: () => void } | null;
};

const savedChartTile = (
    t: TFunction,
    attached: AttachedSavedChart,
    retry: () => void,
) => {
    const space = attached.spaceName ?? t('source.savedCharts');
    const rowCount = attached.rowCount ?? 0;
    const readyMeta = t('source.savedChartReady', { space, count: rowCount });
    return {
        icon: IconChartBar,
        isAccent: true,
        title: attached.chartName,
        meta:
            attached.status === 'running'
                ? t('source.savedChartRunning', { space })
                : attached.status === 'error'
                  ? t('source.savedChartFailed', { space })
                  : attached.ranAt
                    ? t('sourceSection.withRan', {
                          meta: readyMeta,
                          ran: formatDistanceToNow(attached.ranAt, {
                              addSuffix: true,
                              locale: getDateFnsLocale(),
                          }),
                      })
                    : readyMeta,
        isRunning: attached.status === 'running',
        failure:
            attached.status === 'error'
                ? {
                      message:
                          attached.message ??
                          t('sourceSection.savedChartQueryFailed'),
                      retry,
                  }
                : null,
    } satisfies TileState;
};

const exploreTile = (
    t: TFunction,
    attached: AttachedExplore,
    retry: () => void,
) =>
    ({
        icon: IconTable,
        isAccent: true,
        title: attached.label,
        meta: exploreQueryMeta(attached),
        isRunning:
            attached.isRunning ||
            attached.isPickingFields ||
            attached.status === 'loading',
        failure:
            attached.status === 'error'
                ? {
                      message:
                          attached.message ??
                          t('sourceSection.tableQueryFailed'),
                      retry,
                  }
                : null,
    }) satisfies TileState;

const getSampleTile = (t: TFunction): TileState => ({
    icon: IconFlask,
    isAccent: false,
    title: t('rowsPeek.sampleData'),
    meta: t('sourceSection.sampleMeta'),
    isRunning: false,
    failure: null,
});

/** The sidebar's "Preview data": one tile naming what the preview renders
 *  from, which opens the data source picker. */
const DataSourceSection: FC<Props> = ({ savedChartSource, exploreSource }) => {
    const { t } = useTranslation('chartTypes');
    const [pickerOpened, setPickerOpened] = useState(false);
    const projectUuid = useProjectUuid();
    // Warms the cache so the suggested row is there when the picker opens.
    useSuggestedChartTypeExplore(
        projectUuid,
        exploreSource?.suggestTable ?? null,
    );
    const tile: TileState = savedChartSource?.attached
        ? savedChartTile(t, savedChartSource.attached, savedChartSource.retry)
        : exploreSource?.attached
          ? exploreTile(t, exploreSource.attached, exploreSource.retry)
          : getSampleTile(t);

    return (
        <Stack gap="xs">
            <Text component="h3" fz="sm" fw={600}>
                {t('canvas.previewData')}
            </Text>
            <DataSourcePicker
                opened={pickerOpened}
                onOpenedChange={setPickerOpened}
                savedChartSource={savedChartSource}
                exploreSource={exploreSource}
                position="bottom"
                width="target"
            >
                <PolymorphicGroupButton
                    component="button"
                    type="button"
                    className={classes.sourceRow}
                    gap="sm"
                    wrap="nowrap"
                    w="100%"
                    aria-label={t('sourceSection.changePreviewData', {
                        title: tile.title,
                    })}
                    onClick={() => setPickerOpened((opened) => !opened)}
                >
                    <Box
                        className={
                            tile.isAccent
                                ? classes.iconTileAccent
                                : classes.iconTile
                        }
                    >
                        <MantineIcon icon={tile.icon} size={16} />
                    </Box>
                    <Stack gap="xxs" flex={1} miw={0}>
                        <Text fz="sm" fw={500} truncate>
                            {tile.title}
                        </Text>
                        <Group gap={6} wrap="nowrap">
                            {tile.isRunning && <Loader size={11} />}
                            <Text
                                fz="xs"
                                c={tile.failure ? 'red' : 'dimmed'}
                                truncate
                            >
                                {tile.meta}
                            </Text>
                        </Group>
                    </Stack>
                    <MantineIcon
                        icon={IconChevronDown}
                        size={14}
                        color="dimmed"
                    />
                </PolymorphicGroupButton>
            </DataSourcePicker>
            {tile.failure && (
                <Stack gap={6} align="flex-start">
                    <Text size="xs" c="red">
                        {tile.failure.message}
                    </Text>
                    <Button
                        variant="default"
                        size="compact-xs"
                        leftSection={
                            <MantineIcon icon={IconRefresh} size={14} />
                        }
                        onClick={tile.failure.retry}
                    >
                        {t('upgrade.tryAgain')}
                    </Button>
                </Stack>
            )}
        </Stack>
    );
};

export default DataSourceSection;
