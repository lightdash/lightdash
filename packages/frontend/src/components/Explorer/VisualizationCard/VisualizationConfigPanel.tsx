import { assertUnreachable, ChartType } from '@lightdash/common';
import { FC, memo } from 'react';

import useSearchParams from '../../../hooks/useSearchParams';
import BigNumberConfigPanel from '../../VisualizationConfigs/BigNumberConfig';
import BigNumberConfigTabs from '../../VisualizationConfigs/BigNumberConfig/BigNumberConfigTabs';
import ChartConfigPanel from '../../VisualizationConfigs/ChartConfigPanel';
import ChartConfigTabs from '../../VisualizationConfigs/ChartConfigPanel/ChartConfigTabs';
import PieConfigPanel from '../../VisualizationConfigs/PieChartConfig';
import PieChartConfigTabs from '../../VisualizationConfigs/PieChartConfig/PieChartConfigTabs';
import TableConfigPanel from '../../VisualizationConfigs/TableConfigPanel';
import TableConfigTabs from '../../VisualizationConfigs/TableConfigPanel/TableConfigTabs';
import ConfigMenuContainer from './ConfigMenuContainer';

const VisualizationConfigPanel: FC<{ chartType: ChartType }> = memo(
    ({ chartType }) => {
        // FEATURE FLAG: if the URL query contains moveMenu, we show
        // the moving menu for chart config
        const movable = useSearchParams('moveMenu');
        if (!movable) {
            switch (chartType) {
                case ChartType.BIG_NUMBER:
                    return <BigNumberConfigPanel />;
                case ChartType.TABLE:
                    return <TableConfigPanel />;
                case ChartType.CARTESIAN:
                    return <ChartConfigPanel />;
                case ChartType.PIE:
                    return <PieConfigPanel />;
                default:
                    return assertUnreachable(
                        chartType,
                        `Chart type ${chartType} not supported`,
                    );
            }
        } else {
            return (
                <ConfigMenuContainer>
                    {(() => {
                        switch (chartType) {
                            case ChartType.BIG_NUMBER:
                                return <BigNumberConfigTabs />;
                            case ChartType.TABLE:
                                return <TableConfigTabs />;
                            case ChartType.CARTESIAN:
                                return <ChartConfigTabs />;
                            case ChartType.PIE:
                                return <PieChartConfigTabs />;
                            default:
                                return assertUnreachable(
                                    chartType,
                                    `Chart type ${chartType} not supported`,
                                );
                        }
                    })()}
                </ConfigMenuContainer>
            );
        }
    },
);

export default VisualizationConfigPanel;
