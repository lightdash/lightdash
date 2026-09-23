import {
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
    IconRefresh,
    IconSearch,
    IconSwitchHorizontal,
    IconTable,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import DataSourcePicker from './DataSourcePicker';
import { exploreSummary, type ExploreSourceControls } from './exploreSource';
import classes from './SavedChartSourceCard.module.css';

type Props = { source: ExploreSourceControls };

/**
 * The canvas' explore card: the offer to preview with an explore, and the
 * attached explore after. Picking the explore is the only action; the chart
 * inputs decide which of its fields the query selects.
 */
const ExploreSourceCard: FC<Props> = ({ source }) => {
    const [pickerOpened, setPickerOpened] = useState(false);
    const attached = source.attached;

    if (!attached) {
        return (
            <Paper className={classes.emptyCard} variant="dotted">
                <Group gap="sm" wrap="nowrap">
                    <Box className={classes.iconTile}>
                        <MantineIcon icon={IconTable} size={18} />
                    </Box>
                    <Stack gap={2} flex={1} miw={0}>
                        <Text fz="sm" fw={500} c="ldGray.8">
                            Use a table
                        </Text>
                        <Text fz="xs" c="dimmed" lh={1.5}>
                            Preview with fields from one of your tables.
                        </Text>
                    </Stack>
                    <DataSourcePicker
                        opened={pickerOpened}
                        onOpenedChange={setPickerOpened}
                        savedChartSource={null}
                        exploreSource={source}
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
                            Choose table
                        </Button>
                    </DataSourcePicker>
                </Group>
            </Paper>
        );
    }

    return (
        <Group className={classes.attachedCard} gap="sm" wrap="nowrap">
            <Box className={classes.iconTileAccent}>
                <MantineIcon icon={IconTable} size={18} />
            </Box>
            <Stack gap={6} flex={1} miw={0}>
                <Group gap="xs" align="baseline" wrap="nowrap">
                    <Text fz="sm" fw={500} truncate>
                        {attached.label}
                    </Text>
                    <Group gap={6} wrap="nowrap" flex="0 1 auto" miw={0}>
                        {attached.status === 'loading' && <Loader size={12} />}
                        <Text fz="xs" c="dimmed" truncate>
                            {attached.status === 'loading'
                                ? 'Table'
                                : exploreSummary(attached)}
                        </Text>
                    </Group>
                </Group>
                {attached.status === 'error' ? (
                    <Text fz="xs" c="red" lh={1.4}>
                        {attached.message ?? 'Couldn’t load this table.'}
                    </Text>
                ) : (
                    <Text fz="xs" c="dimmed" lh={1.5}>
                        The first version picks its fields from {attached.label}{' '}
                        and runs the query.
                    </Text>
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
                <DataSourcePicker
                    opened={pickerOpened}
                    onOpenedChange={setPickerOpened}
                    savedChartSource={null}
                    exploreSource={source}
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
                        Change
                    </Button>
                </DataSourcePicker>
                <Tooltip label="Use sample data instead">
                    <CloseButton
                        aria-label="Use sample data instead"
                        onClick={source.detach}
                    />
                </Tooltip>
            </Group>
        </Group>
    );
};

export default ExploreSourceCard;
