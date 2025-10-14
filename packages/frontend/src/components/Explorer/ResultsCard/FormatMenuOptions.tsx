import { type Metric } from '@lightdash/common';
import { Menu } from '@mantine/core';
import { type FC } from 'react';
import {
    explorerActions,
    useExplorerDispatch,
} from '../../../features/explorer/store';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';

type Props = {
    item: Metric;
};

const FormatMenuOptions: FC<Props> = ({ item }) => {
    const { track } = useTracking();
    const dispatch = useExplorerDispatch();

    const onCreate = () => {
        dispatch(explorerActions.toggleFormatModal({ metric: item }));
        track({
            name: EventName.FORMAT_METRIC_BUTTON_CLICKED,
        });
    };

    return (
        <>
            <Menu.Label>Format</Menu.Label>
            <Menu.Item onClick={onCreate}>Edit format</Menu.Item>
        </>
    );
};

export default FormatMenuOptions;
