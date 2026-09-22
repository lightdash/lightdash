import { Box, Popover, Text } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import {
    QueryPickerView,
    type SelectedChart,
    type SelectedDashboard,
} from '../../apps/AppResourcePicker';
import { useAttachResourceLink } from '../../apps/hooks/useAttachResourceLink';
import { SAVED_CHART_PREVIEW_ROW_LIMIT } from '../utils/savedChartPreviewQuery';
import classes from './SavedChartPickerPopover.module.css';
import { type PickedSavedChart } from './savedChartSource';

const noop = () => {};

type Props = {
    /** The control the picker hangs off. */
    children: ReactNode;
    opened: boolean;
    onOpenedChange: (opened: boolean) => void;
    /** The chart already attached, shown as picked; null when there is none. */
    attached: PickedSavedChart | null;
    onPick: (chart: PickedSavedChart) => void;
    position?: 'top-start' | 'bottom-end';
};

/**
 * The app builder's chart picker, single-pick: choosing a chart attaches it
 * and closes. Wraps whichever control opened it so the same popover serves
 * the canvas card, the composer chip and the sidebar.
 */
const SavedChartPickerPopover: FC<Props> = ({
    children,
    opened,
    onOpenedChange,
    attached,
    onPick,
    position = 'bottom-end',
}) => {
    const projectUuid = useProjectUuid();
    const pick = (chart: PickedSavedChart) => {
        onPick(chart);
        onOpenedChange(false);
    };
    const { attachFromLink, isResolvingLink } = useAttachResourceLink({
        projectUuid,
        onSelectChart: (chart: SelectedChart) =>
            pick({ uuid: chart.uuid, name: chart.name }),
        onSelectDashboard: (_dashboard: SelectedDashboard) => noop(),
    });

    return (
        <Popover
            opened={opened}
            onChange={onOpenedChange}
            position={position}
            offset={6}
            trapFocus
        >
            <Popover.Target>{children}</Popover.Target>
            <Popover.Dropdown className={classes.dropdown} p={0}>
                <Box pt="xs">
                    <QueryPickerView
                        selectedCharts={
                            attached
                                ? [
                                      {
                                          uuid: attached.uuid,
                                          name: attached.name,
                                          includeSampleData: false,
                                          linkLive: false,
                                      },
                                  ]
                                : []
                        }
                        onSelect={(chart) =>
                            pick({ uuid: chart.uuid, name: chart.name })
                        }
                        onDeselect={() => onOpenedChange(false)}
                        onDone={() => onOpenedChange(false)}
                        enabled={opened}
                        attachFromLink={attachFromLink}
                        isResolvingLink={isResolvingLink}
                        footer={
                            <Text fz="xs" c="dimmed" w="100%">
                                Picking a chart runs its query · up to{' '}
                                {SAVED_CHART_PREVIEW_ROW_LIMIT} rows
                            </Text>
                        }
                    />
                </Box>
            </Popover.Dropdown>
        </Popover>
    );
};

export default SavedChartPickerPopover;
