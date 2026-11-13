import { type ChartType } from '@lightdash/common';
import { Button } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { type FC } from 'react';
import {
    explorerActions,
    useExplorerDispatch,
} from '../../../features/explorer/store';
import { COLLAPSABLE_CARD_BUTTON_PROPS } from '../../common/CollapsableCard/constants';
import MantineIcon from '../../common/MantineIcon';
import { useChartTypeOptions } from '../ChartGallery/useChartTypeOptions';

type Props = {
    chartType: ChartType;
};

/** Names the current chart type and opens the gallery to change it. */
const ChartTypeButton: FC<Props> = ({ chartType }) => {
    const dispatch = useExplorerDispatch();
    const { getSelectedChartTypeItem } = useChartTypeOptions();
    const selected = getSelectedChartTypeItem(chartType, null);

    return (
        <Button
            {...COLLAPSABLE_CARD_BUTTON_PROPS}
            aria-label={`Chart type: ${selected.label}. Change chart type`}
            leftSection={<MantineIcon icon={selected.icon} />}
            rightSection={<MantineIcon icon={IconChevronDown} size={12} />}
            onClick={() => {
                dispatch(explorerActions.openVisualizationConfig());
                dispatch(explorerActions.setChartSidebarStep('choose'));
            }}
        >
            {selected.label}
        </Button>
    );
};

export default ChartTypeButton;
