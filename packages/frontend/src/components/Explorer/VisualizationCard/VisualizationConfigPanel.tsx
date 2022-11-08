import { ChartType } from '@lightdash/common';
import { FC, memo } from 'react';
import BigNumberConfigPanel from '../../BigNumberConfig';
import ChartConfigPanel from '../../ChartConfigPanel';
import TableConfigPanel from '../../TableConfigPanel';

export const VisualizationConfigPanel: FC<{ chartType: ChartType }> = memo(
    ({ chartType }) => {
        switch (chartType) {
            case ChartType.BIG_NUMBER:
                return <BigNumberConfigPanel />;
            case ChartType.TABLE:
                return <TableConfigPanel />;
            default:
                return <ChartConfigPanel />;
        }
    },
);

export default VisualizationConfigPanel;
