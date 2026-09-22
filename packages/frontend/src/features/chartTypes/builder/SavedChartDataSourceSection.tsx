import { Box, Button, Group, Loader, Stack, Text } from '@mantine/core';
import {
    IconChartBar,
    IconFlask,
    IconSwitchHorizontal,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import classes from './SavedChartDataSourceSection.module.css';
import SavedChartPickerPopover from './SavedChartPickerPopover';
import { type SavedChartSourceControls } from './savedChartSource';

type Props = { source: SavedChartSourceControls };

/** The sidebar's "Data source": which saved chart the preview runs on, and
 *  the two ways out of it. */
const SavedChartDataSourceSection: FC<Props> = ({ source }) => {
    const [pickerOpened, setPickerOpened] = useState(false);
    const attached = source.attached;
    if (!attached) return null;

    const space = attached.spaceName ?? 'Saved charts';
    const meta =
        attached.status === 'ready'
            ? `Saved chart · ${space} · ${attached.rowCount ?? 0} ${
                  attached.rowCount === 1 ? 'row' : 'rows'
              }`
            : attached.status === 'error'
              ? (attached.message ?? 'The query failed')
              : `Saved chart · ${space} · running query…`;

    return (
        <Stack gap="xs">
            <Text fz="sm" fw={600}>
                Data source
            </Text>
            <Group className={classes.sourceRow} gap="sm" wrap="nowrap">
                <Box className={classes.iconTile}>
                    <MantineIcon icon={IconChartBar} size={16} />
                </Box>
                <Stack gap={2} flex={1} miw={0}>
                    <Text fz="sm" fw={500} truncate>
                        {attached.chartName}
                    </Text>
                    <Group gap={6} wrap="nowrap">
                        {attached.status === 'running' && <Loader size={11} />}
                        <Text
                            fz="xs"
                            c={attached.status === 'error' ? 'red' : 'dimmed'}
                            truncate
                        >
                            {meta}
                        </Text>
                    </Group>
                </Stack>
            </Group>
            <Group gap={6}>
                <SavedChartPickerPopover
                    opened={pickerOpened}
                    onOpenedChange={setPickerOpened}
                    attached={null}
                    onPick={source.attach}
                >
                    <Button
                        variant="default"
                        size="compact-xs"
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
                <Button
                    variant="default"
                    size="compact-xs"
                    leftSection={<MantineIcon icon={IconFlask} size={14} />}
                    onClick={source.detach}
                >
                    Use sample data
                </Button>
                {attached.status === 'error' && (
                    <Button
                        variant="subtle"
                        size="compact-xs"
                        onClick={source.retry}
                    >
                        Try again
                    </Button>
                )}
            </Group>
        </Stack>
    );
};

export default SavedChartDataSourceSection;
