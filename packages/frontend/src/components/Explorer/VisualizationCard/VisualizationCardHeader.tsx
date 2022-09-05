import { Button, H5 } from '@blueprintjs/core';
import { ChartType } from '@lightdash/common';
import { FC, memo, useCallback, useMemo } from 'react';
import {
    ExplorerSection,
    useExplorerContext,
} from '../../../providers/ExplorerProvider';
import BigNumberConfigPanel from '../../BigNumberConfig';
import ChartConfigPanel from '../../ChartConfigPanel';
import { ChartDownloadMenu } from '../../ChartDownload';
import TableConfigPanel from '../../TableConfigPanel';
import VisualizationCardOptions from '../VisualizationCardOptions';
import ShowTotalsToggle from './ShowTotalsToggle';
import {
    CardHeader,
    CardHeaderButtons,
    CardHeaderTitle,
} from './VisualizationCard.styles';

export const ConfigPanel: FC<{ chartType: ChartType }> = memo(
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

const VisualizationCardHeader = memo(() => {
    const isEditMode = useExplorerContext(
        (context) => context.state.isEditMode,
    );
    const expandedSections = useExplorerContext(
        (context) => context.state.expandedSections,
    );
    const toggleExpandedSection = useExplorerContext(
        (context) => context.actions.toggleExpandedSection,
    );
    const chartType = useExplorerContext(
        (context) => context.state.unsavedChartVersion.chartConfig.type,
    );
    const vizIsOpen = useMemo(
        () => expandedSections.includes(ExplorerSection.VISUALIZATION),
        [expandedSections],
    );
    const toggleSection = useCallback(
        () => toggleExpandedSection(ExplorerSection.VISUALIZATION),
        [toggleExpandedSection],
    );
    return (
        <CardHeader>
            <CardHeaderTitle>
                <Button
                    icon={vizIsOpen ? 'chevron-down' : 'chevron-right'}
                    minimal
                    onClick={toggleSection}
                />
                <H5>Charts</H5>
            </CardHeaderTitle>
            {vizIsOpen && (
                <CardHeaderButtons>
                    {isEditMode && (
                        <>
                            <VisualizationCardOptions />
                            <ConfigPanel chartType={chartType} />
                        </>
                    )}
                    {!isEditMode && chartType === 'table' && (
                        <ShowTotalsToggle />
                    )}
                    <ChartDownloadMenu />
                </CardHeaderButtons>
            )}
        </CardHeader>
    );
});

export default VisualizationCardHeader;
