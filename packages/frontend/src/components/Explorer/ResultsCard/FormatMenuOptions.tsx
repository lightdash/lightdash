import { getItemId, type Metric } from '@lightdash/common';
import { Menu } from '@mantine/core';
import { type FC } from 'react';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';

type Props = {
    item: Metric;
};

const FormatMenuOptions: FC<Props> = ({ item }) => {
    const toggleFormatModal = useExplorerContext(
        (context) => context.actions.toggleFormatModal,
    );
    const updateMetricFormat = useExplorerContext(
        (context) => context.actions.updateMetricFormat,
    );
    const metricOverrides = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.metricOverrides,
    );
    const { track } = useTracking();
    const onCreate = () => {
        toggleFormatModal({ metric: item });
        track({
            name: EventName.FORMAT_METRIC_BUTTON_CLICKED,
        });
    };

    return (
        <>
            <Menu.Label>Formatting</Menu.Label>
            <Menu.Item onClick={onCreate}>Edit formatting</Menu.Item>
            {metricOverrides &&
                metricOverrides[getItemId(item)]?.formatOptions !==
                    undefined && (
                    <Menu.Item
                        onClick={() =>
                            updateMetricFormat({
                                metric: item,
                                formatOptions: undefined,
                            })
                        }
                    >
                        Reset formatting
                    </Menu.Item>
                )}
        </>
    );
};

export default FormatMenuOptions;
