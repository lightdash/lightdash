import { type ChartType } from '@lightdash/common';
import { Text, UnstyledButton } from '@mantine/core';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import { useChartTypeOptions } from '../ChartGallery/useChartTypeOptions';
import classes from './VisualizationCard.module.css';

type Props = {
    chartType: ChartType;
    onClick: () => void;
};

/** What a closed Chart row holds: its chart type, quiet, opening it on click. */
const ChartTypeSummary: FC<Props> = ({ chartType, onClick }) => {
    const { getSelectedChartTypeItem } = useChartTypeOptions();
    const selected = getSelectedChartTypeItem(chartType, null);

    return (
        <UnstyledButton
            className={classes.summary}
            aria-label={`${selected.label}. Open the chart`}
            data-tour="explorer-visualize"
            onClick={onClick}
        >
            <MantineIcon icon={selected.icon} size={14} />
            <Text fz="xs" inherit>
                {selected.label}
            </Text>
        </UnstyledButton>
    );
};

export default ChartTypeSummary;
