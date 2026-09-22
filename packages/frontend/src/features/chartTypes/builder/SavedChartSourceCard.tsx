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
    Stack,
    Text,
} from '@mantine/core';
import {
    IconChartBar,
    IconRefresh,
    IconSearch,
    IconSwitchHorizontal,
    IconTable,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import FieldIcon from '../../../components/common/Filters/FieldIcon';
import MantineIcon from '../../../components/common/MantineIcon';
import SavedChartPickerPopover from './SavedChartPickerPopover';
import {
    type AttachedSavedChart,
    type SavedChartSourceControls,
} from './savedChartSource';
import classes from './SavedChartSourceCard.module.css';

type Props = { source: SavedChartSourceControls };

const rowsLabel = (rowCount: number): string =>
    `${rowCount} ${rowCount === 1 ? 'row' : 'rows'}`;

/** The right-hand side of the meta line: how the one run is going. Never
 *  wraps; a long chart name truncates instead. */
const MetaLine: FC<{ attached: AttachedSavedChart }> = ({ attached }) => {
    const space = attached.spaceName ?? 'Saved charts';
    switch (attached.status) {
        case 'running':
            return (
                <Group gap={6} wrap="nowrap" flex="0 0 auto">
                    <Loader size={12} />
                    <Text fz="xs" c="dimmed" truncate>
                        Saved chart · {space} · running query…
                    </Text>
                </Group>
            );
        case 'error':
            return (
                <Text fz="xs" c="red" truncate flex="0 0 auto">
                    Saved chart · {space} · query failed
                </Text>
            );
        case 'ready':
            return (
                <Text fz="xs" c="dimmed" truncate flex="0 0 auto">
                    Saved chart · {space} · {rowsLabel(attached.rowCount ?? 0)}
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
    const [pickerOpened, setPickerOpened] = useState(false);
    const attached = source.attached;

    if (!attached) {
        return (
            <Group className={classes.emptyCard} gap="sm" wrap="nowrap">
                <Box className={classes.iconTile}>
                    <MantineIcon icon={IconChartBar} size={18} />
                </Box>
                <Stack gap={2} flex={1} miw={0}>
                    <Text fz="sm" fw={500} c="ldGray.8">
                        Use a saved chart
                    </Text>
                    <Text fz="xs" c="dimmed" lh={1.5}>
                        Preview and build against real fields instead of sample
                        data. You can switch back any time.
                    </Text>
                </Stack>
                <SavedChartPickerPopover
                    opened={pickerOpened}
                    onOpenedChange={setPickerOpened}
                    attached={null}
                    onPick={source.attach}
                >
                    <Button
                        variant="default"
                        size="xs"
                        leftSection={
                            <MantineIcon icon={IconSearch} size={14} />
                        }
                        onClick={() => setPickerOpened((opened) => !opened)}
                    >
                        Choose saved chart
                    </Button>
                </SavedChartPickerPopover>
            </Group>
        );
    }

    return (
        <Stack gap={6} className={classes.attachedWrapper}>
            <Group className={classes.attachedCard} gap="sm" wrap="nowrap">
                <Box className={classes.iconTileAccent}>
                    <MantineIcon icon={IconChartBar} size={18} />
                </Box>
                <Stack gap={6} flex={1} miw={0}>
                    <Group gap="xs" align="baseline" wrap="nowrap">
                        <Text fz="sm" fw={500} truncate>
                            {attached.chartName}
                        </Text>
                        <MetaLine attached={attached} />
                    </Group>
                    {attached.status === 'error' && (
                        <Text fz="xs" c="red" lh={1.4}>
                            {attached.message ?? 'Couldn’t run this chart.'}
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
                                    <Text fz={11} fw={500}>
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
                            Try again
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
                            View query results
                        </Button>
                    )}
                    <SavedChartPickerPopover
                        opened={pickerOpened}
                        onOpenedChange={setPickerOpened}
                        attached={null}
                        onPick={source.attach}
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
                            Change
                        </Button>
                    </SavedChartPickerPopover>
                    <CloseButton
                        aria-label="Use sample data instead"
                        onClick={source.detach}
                    />
                </Group>
            </Group>
            <Text fz="xs" c="dimmed" ta="center">
                {source.includeRows ? (
                    `Sample data included · sends up to ${MAX_APP_VIZ_BUILD_SAMPLE_ROWS} rows with your prompt.`
                ) : (
                    <>
                        Rows aren’t sent with your prompt.{' '}
                        <Anchor
                            component="button"
                            type="button"
                            fz="xs"
                            onClick={() => source.setIncludeRows(true)}
                        >
                            Include sample data
                        </Anchor>{' '}
                        to send up to {MAX_APP_VIZ_BUILD_SAMPLE_ROWS}.
                    </>
                )}
            </Text>
        </Stack>
    );
};

export default SavedChartSourceCard;
