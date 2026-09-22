import { Box, Button, Group, Loader, Stack, Text } from '@mantine/core';
import {
    IconChartBar,
    IconFlask,
    IconRefresh,
    IconSearch,
    IconSwitchHorizontal,
} from '@tabler/icons-react';
import { formatDistanceToNow } from 'date-fns';
import { useState, type FC, type ReactNode } from 'react';
import Callout from '../../../components/common/Callout';
import MantineIcon from '../../../components/common/MantineIcon';
import { PolymorphicGroupButton } from '../../../components/common/PolymorphicGroupButton';
import classes from './SavedChartDataSourceSection.module.css';
import SavedChartPickerPopover from './SavedChartPickerPopover';
import { type SavedChartSourceControls } from './savedChartSource';

type Props = { source: SavedChartSourceControls };
type PickerAnchor = 'action' | 'tile';

/** The sidebar's "Data source": the tile the preview currently renders from,
 *  sample or saved chart, and the ways to change it. Switching to sample data
 *  keeps the chart attached. */
const SavedChartDataSourceSection: FC<Props> = ({ source }) => {
    const [pickerAnchor, setPickerAnchor] = useState<PickerAnchor | null>(null);
    const attached = source.attached;
    const showingChart = attached !== null && source.previewSource === 'chart';

    const pickerButton = (label: string, icon: typeof IconSearch) => (
        <SavedChartPickerPopover
            opened={pickerAnchor === 'action'}
            onOpenedChange={(opened) =>
                setPickerAnchor(opened ? 'action' : null)
            }
            attached={null}
            onPick={source.attach}
        >
            <Button
                variant="default"
                size="compact-xs"
                leftSection={<MantineIcon icon={icon} size={14} />}
                onClick={() =>
                    setPickerAnchor((current) =>
                        current === 'action' ? null : 'action',
                    )
                }
            >
                {label}
            </Button>
        </SavedChartPickerPopover>
    );

    let title: string;
    let meta: ReactNode;
    let actions: ReactNode;
    if (!showingChart) {
        title = 'Sample data';
        meta = (
            <Text fz="xs" c="dimmed" truncate>
                Generated from the chart inputs
            </Text>
        );
        actions = attached ? (
            <Button
                variant="default"
                size="compact-xs"
                leftSection={<MantineIcon icon={IconChartBar} size={14} />}
                onClick={() => source.setPreviewSource('chart')}
            >
                Use saved chart
            </Button>
        ) : (
            pickerButton('Choose saved chart', IconSearch)
        );
    } else {
        title = attached.chartName;
        const space = attached.spaceName ?? 'Saved charts';
        if (attached.status === 'running') {
            meta = (
                <Group gap={6} wrap="nowrap">
                    <Loader size={11} />
                    <Text fz="xs" c="dimmed" truncate>
                        {space} · running query…
                    </Text>
                </Group>
            );
        } else if (attached.status === 'error') {
            meta = (
                <Text fz="xs" c="dimmed" truncate>
                    {space} · query failed
                </Text>
            );
        } else {
            const rowCount = attached.rowCount ?? 0;
            const ran = attached.ranAt
                ? ` · ran ${formatDistanceToNow(attached.ranAt, {
                      addSuffix: true,
                  })}`
                : '';
            meta = (
                <Text fz="xs" c="dimmed" truncate>
                    {space} · {rowCount} {rowCount === 1 ? 'row' : 'rows'}
                    {ran}
                </Text>
            );
        }
        actions = (
            <>
                {pickerButton('Change', IconSwitchHorizontal)}
                <Button
                    variant="default"
                    size="compact-xs"
                    leftSection={<MantineIcon icon={IconFlask} size={14} />}
                    onClick={() => source.setPreviewSource('sample')}
                >
                    Use sample data
                </Button>
            </>
        );
    }

    const sourceContent = (
        <>
            <Box
                className={
                    showingChart ? classes.iconTileAccent : classes.iconTile
                }
            >
                <MantineIcon
                    icon={showingChart ? IconChartBar : IconFlask}
                    size={16}
                />
            </Box>
            <Stack gap={2} flex={1} miw={0}>
                <Text fz="sm" fw={500} truncate>
                    {title}
                </Text>
                {meta}
            </Stack>
        </>
    );

    return (
        <Stack gap="xs">
            <Text component="h3" fz="sm" fw={600}>
                Data source
            </Text>
            {showingChart ? (
                <SavedChartPickerPopover
                    opened={pickerAnchor === 'tile'}
                    onOpenedChange={(opened) =>
                        setPickerAnchor(opened ? 'tile' : null)
                    }
                    attached={null}
                    onPick={source.attach}
                >
                    <PolymorphicGroupButton
                        component="button"
                        type="button"
                        className={`${classes.sourceRow} ${classes.sourceButton}`}
                        gap="sm"
                        wrap="nowrap"
                        w="100%"
                        aria-label={`Change saved chart: ${title}`}
                        onClick={() =>
                            setPickerAnchor((current) =>
                                current === 'tile' ? null : 'tile',
                            )
                        }
                    >
                        {sourceContent}
                    </PolymorphicGroupButton>
                </SavedChartPickerPopover>
            ) : (
                <Group className={classes.sourceRow} gap="sm" wrap="nowrap">
                    {sourceContent}
                </Group>
            )}
            {showingChart && attached.status === 'error' && (
                <Callout variant="danger" title="Couldn’t run the query">
                    <Stack gap="xs" align="flex-start">
                        <Text fz="xs" lh={1.4}>
                            {attached.message ??
                                'The saved chart’s query failed.'}
                        </Text>
                        <Button
                            variant="default"
                            size="compact-xs"
                            leftSection={
                                <MantineIcon icon={IconRefresh} size={14} />
                            }
                            onClick={source.retry}
                        >
                            Try again
                        </Button>
                    </Stack>
                </Callout>
            )}
            <Group gap={6}>{actions}</Group>
        </Stack>
    );
};

export default SavedChartDataSourceSection;
