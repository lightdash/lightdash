import {
    assertUnreachable,
    getItemLabelWithoutTableName,
    MAX_APP_VIZ_BUILD_SAMPLE_ROWS,
} from '@lightdash/common';
import {
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
    IconSearch,
    IconSwitchHorizontal,
    IconTable,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import FieldIcon from '../../../components/common/Filters/FieldIcon';
import MantineIcon from '../../../components/common/MantineIcon';
import SavedChartPickerPopover from './SavedChartPickerPopover';
import { type SavedChartSourceControls } from './savedChartSource';
import classes from './SavedChartSourceCard.module.css';

type Props = { source: SavedChartSourceControls };

const rowsLabel = (rowCount: number): string =>
    `${rowCount} ${rowCount === 1 ? 'row' : 'rows'}`;

/** The right-hand side of the meta line: how the one run is going. */
const StatusLine: FC<{ source: SavedChartSourceControls }> = ({ source }) => {
    const attached = source.attached;
    if (!attached) return null;
    const space = attached.spaceName ?? 'Saved charts';
    switch (attached.status) {
        case 'running':
            return (
                <Group gap={6} wrap="nowrap">
                    <Loader size={12} />
                    <Text fz="xs" c="dimmed">
                        Saved chart · {space} · running query…
                    </Text>
                </Group>
            );
        case 'error':
            return (
                <Group gap="xs" wrap="nowrap">
                    <Text fz="xs" c="red">
                        {attached.message ?? 'The query failed'}
                    </Text>
                    <Button
                        variant="subtle"
                        size="compact-xs"
                        onClick={source.retry}
                    >
                        Try again
                    </Button>
                </Group>
            );
        case 'ready':
            return (
                <Text fz="xs" c="dimmed">
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
                        Use a saved chart’s query
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
                        <StatusLine source={source} />
                    </Group>
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
                    {attached.status === 'ready' && (
                        <Button
                            variant="default"
                            size="xs"
                            leftSection={
                                <MantineIcon icon={IconTable} size={14} />
                            }
                            onClick={source.viewRows}
                        >
                            View rows
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
                Preview only · rows are not sent with your prompt unless you
                turn on the sample data button in the composer (up to{' '}
                {MAX_APP_VIZ_BUILD_SAMPLE_ROWS} rows).
            </Text>
        </Stack>
    );
};

export default SavedChartSourceCard;
