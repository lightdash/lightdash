import { ChartType } from '@lightdash/common';
import { FC, memo } from 'react';
import BigNumberConfigPanel from '../../BigNumberConfig';
import ChartConfigPanel from '../../ChartConfigPanel';
import LegendProvider from '../../SimpleChart/LegendProvider';
import TableConfigPanel from '../../TableConfigPanel';

const VisualizationConfigPanel: FC<{ chartType: ChartType }> = memo(
    ({ chartType }) => {
        switch (chartType) {
            case ChartType.BIG_NUMBER:
                return <BigNumberConfigPanel />;
            case ChartType.TABLE:
                return <TableConfigPanel />;
            default:
                return (
                    <LegendProvider>
                        <ChartConfigPanel />
                    </LegendProvider>
                );
        }
    },
);

export default VisualizationConfigPanel;
