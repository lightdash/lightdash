import { assertUnreachable, ChartType } from '@lightdash/common';
import { FC, memo } from 'react';
import BigNumberConfigPanel from '../../BigNumberConfig';
import ChartConfigPanel from '../../ChartConfigPanel';
import TableConfigPanel from '../../TableConfigPanel';

const VisualizationConfigPanel: FC<{ chartType: ChartType }> = memo(
    ({ chartType }) => {
        switch (chartType) {
            case ChartType.BIG_NUMBER:
                return <BigNumberConfigPanel />;
            case ChartType.TABLE:
                return <TableConfigPanel />;
            case ChartType.CARTESIAN:
                return <ChartConfigPanel />;
            case ChartType.PIE:
                return <div>PIE CONFIG GOES HERE</div>;
            default:
                return assertUnreachable(
                    chartType,
                    `Chart type ${chartType} not supported`,
                );
        }
    },
);

export default VisualizationConfigPanel;
