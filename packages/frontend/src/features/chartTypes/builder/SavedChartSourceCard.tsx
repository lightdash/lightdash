import {
    assertUnreachable,
    getItemLabelWithoutTableName,
    MAX_APP_VIZ_BUILD_SAMPLE_ROWS,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    Button,
    CloseButton,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconChartBar,
    IconRefresh,
    IconSearch,
    IconSwitchHorizontal,
    IconTable,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import FieldIcon from '../../../components/common/Filters/FieldIcon';
import MantineIcon from '../../../components/common/MantineIcon';
import DataSourcePicker from './DataSourcePicker';
import {
    type AttachedSavedChart,
    type SavedChartSourceControls,
} from './savedChartSource';
import classes from './SavedChartSourceCard.module.css';

type Props = { source: SavedChartSourceControls };

/** The right-hand side of the meta line: how the one run is going. Never
 *  wraps; a long chart name truncates instead. */
const MetaLine: FC<{ attached: AttachedSavedChart }> = ({ attached }) => {
    const { t } = useTranslation('chartTypes');
    const space = attached.spaceName ?? t('source.savedCharts');
    switch (attached.status) {
        case 'running':
            return (
                <Group gap={6} wrap="nowrap" flex="0 0 auto">
                    <Loader size={12} />
                    <Text fz="xs" c="dimmed" truncate>
                        {t('source.savedChartRunning', { space })}
                    </Text>
                </Group>
            );
        case 'error':
            return (
                <Text fz="xs" c="red" truncate flex="0 0 auto">
                    {t('source.savedChartFailed', { space })}
                </Text>
            );
        case 'ready':
            return (
                <Text fz="xs" c="dimmed" truncate flex="0 0 auto">
                    {t('source.savedChartReady', {
                        space,
                        count: attached.rowCount ?? 0,
                    })}
                </Text>
            );
        default:
            return assertUnreachable(
                attached.status,
                'Unknown saved chart source status',
            );
    }
};

/**
 * The canvas' data-source card: the invitation to pick a saved chart before
 * one is attached, and the attached chart with its result columns after.
 */
const SavedChartSourceCard: FC<Props> = ({ source }) => {
    const { t } = useTranslation('chartTypes');
    const [pickerOpened, setPickerOpened] = useState(false);
    const attached = source.attached;

    if (!attached) {
        return (
            <Paper className={classes.emptyCard} variant="dotted">
                <Group gap="sm" wrap="nowrap">
                    <Box className={classes.iconTile}>
                        <MantineIcon icon={IconChartBar} size={18} />
                    </Box>
                    <Stack gap={2} flex={1} miw={0}>
                        <Text fz="sm" fw={500} c="ldGray.8">
                            {t('source.useSavedChart')}
                        </Text>
                        <Text fz="xs" c="dimmed" lh={1.5}>
                            {t('source.useSavedChartDescription')}
                        </Text>
                    </Stack>
                    <DataSourcePicker
                        opened={pickerOpened}
                        onOpenedChange={setPickerOpened}
                        savedChartSource={source}
                        exploreSource={null}
                        position="bottom-end"
                        width={340}
                    >
                        <Button
                            variant="default"
                            size="xs"
                            leftSection={
                                <MantineIcon icon={IconSearch} size={14} />
                            }
                            onClick={() => setPickerOpened((opened) => !opened)}
                        >
                            {t('source.chooseSavedChart')}
                        </Button>
                    </DataSourcePicker>
                </Group>
            </Paper>
        );
    }

    return (
        <Box className={classes.attachedWrapper}>
            <Group className={classes.attachedCard} gap="sm" wrap="nowrap">
                <Box className={classes.iconTileAccent}>
                    <MantineIcon icon={IconChartBar} size={18} />
                </Box>
                <Stack gap={6} flex={1} miw={0}>
                    <Group gap="xs" align="baseline" wrap="nowrap">
                        <Text fz="sm" fw={500} truncate>
                            {attached.chartName}
                        </Text>
                        {attached.status !== 'running' && (
                            <MetaLine attached={attached} />
                        )}
                    </Group>
                    {/* Nothing else fills the second row while the query runs,
                        so the progress line takes it. */}
                    {attached.status === 'running' && (
                        <MetaLine attached={attached} />
                    )}
                    {attached.status === 'error' && (
                        <Text fz="xs" c="red" lh={1.4}>
                            {attached.message ?? t('source.couldNotRunChart')}
                        </Text>
                    )}
                    {attached.columns.length > 0 && (
                        <Group gap={6}>
                            {attached.columns.map((item, index) => (
                                <Group
                                    // Two result columns can share a label.
                                    key={`${getItemLabelWithoutTableName(item)}-${index}`}
                                    className={classes.fieldBadge}
                                    gap={4}
                                    wrap="nowrap"
                                >
                                    <FieldIcon item={item} size={12} />
                                    <Text fz="xs" fw={500}>
                                        {getItemLabelWithoutTableName(item)}
                                    </Text>
                                </Group>
                            ))}
                        </Group>
                    )}
                </Stack>
                <Group gap={6} wrap="nowrap">
                    {attached.status === 'error' && (
                        <Button
                            variant="default"
                            size="xs"
                            leftSection={
                                <MantineIcon icon={IconRefresh} size={14} />
                            }
                            onClick={source.retry}
                        >
                            {t('upgrade.tryAgain')}
                        </Button>
                    )}
                    {attached.status === 'ready' && (
                        <Button
                            variant="default"
                            size="xs"
                            leftSection={
                                <MantineIcon icon={IconTable} size={14} />
                            }
                            onClick={source.viewRows}
                        >
                            {t('source.viewQueryResults')}
                        </Button>
                    )}
                    <DataSourcePicker
                        opened={pickerOpened}
                        onOpenedChange={setPickerOpened}
                        savedChartSource={source}
                        exploreSource={null}
                        position="bottom-end"
                        width={340}
                    >
                        <Button
                            variant="default"
                            size="xs"
                            leftSection={
                                <MantineIcon
                                    icon={IconSwitchHorizontal}
                                    size={14}
                                />
                            }
                            onClick={() => setPickerOpened((opened) => !opened)}
                        >
                            {t('source.change')}
                        </Button>
                    </DataSourcePicker>
                    <Tooltip label={t('source.useSampleData')}>
                        <CloseButton
                            aria-label={t('source.useSampleData')}
                            onClick={source.detach}
                        />
                    </Tooltip>
                </Group>
            </Group>
            <Text fz="xs" c="dimmed" ta="center" className={classes.rowsNote}>
                {source.includeRows ? (
                    t('source.rowsIncluded', {
                        max: MAX_APP_VIZ_BUILD_SAMPLE_ROWS,
                    })
                ) : (
                    <Trans
                        t={t}
                        i18nKey="source.rowsNotSent"
                        values={{ max: MAX_APP_VIZ_BUILD_SAMPLE_ROWS }}
                        components={{
                            include: (
                                <Anchor
                                    component="button"
                                    type="button"
                                    fz="xs"
                                    onClick={() => source.setIncludeRows(true)}
                                />
                            ),
                        }}
                    />
                )}
            </Text>
        </Box>
    );
};

export default SavedChartSourceCard;
