import { ChartType } from '@lightdash/common';
import { Text, UnstyledButton } from '@mantine/core';
import { IconChartBar } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import { useChartTypeOptions } from '../ChartGallery/useChartTypeOptions';
import classes from './VisualizationCard.module.css';

type Props = {
    chartType: ChartType;
    onClick: () => void;
};

/** What a closed Chart row holds once results exist: the way into the chart. */
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
            {/* An untouched query is a table: show what it could become */}
            <MantineIcon
                icon={
                    chartType === ChartType.TABLE ? IconChartBar : selected.icon
                }
                size={14}
            />
            <Text fz="xs" inherit>
                Visualize
            </Text>
        </UnstyledButton>
    );
};

export default ChartTypeSummary;
