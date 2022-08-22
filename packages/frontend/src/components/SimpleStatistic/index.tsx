import { NonIdealState } from '@blueprintjs/core';
import { FC, useState } from 'react';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { LoadingChart } from '../SimpleChart';
import { BigNumberContextMenu } from './BigNumberContextMenu';
import {
    BigNumber,
    BigNumberContainer,
    BigNumberLabel,
    SimpleStatisticsWrapper,
} from './SimpleStatistics.styles';

const SimpleStatistic: FC = () => {
    const {
        resultsData,
        isLoading,
        bigNumberConfig: { bigNumber, bigNumberLabel, defaultLabel },
        isSqlRunner,
    } = useVisualizationContext();
    const [isContextMenuOpen, setIsContextMenuOpen] = useState<boolean>(false);
    const [contextMenuTargetOffset, setContextMenuTargetOffset] = useState<{
        left: number;
        top: number;
    }>({ left: 0, top: 0 });

    const validData = bigNumber && resultsData?.rows.length;

    if (isLoading) return <LoadingChart />;

    return (
        <>
            {validData ? (
                <SimpleStatisticsWrapper
                    onContextMenu={(e: any) => {
                        setIsContextMenuOpen(true);
                        setContextMenuTargetOffset({
                            left: e.pageX,
                            top: e.pageY,
                        });
                        e.preventDefault();
                    }}
                >
                    <BigNumberContainer>
                        <BigNumber>{bigNumber}</BigNumber>
                        <BigNumberLabel>
                            {bigNumberLabel || defaultLabel}
                        </BigNumberLabel>
                        {!isSqlRunner && (
                            <BigNumberContextMenu
                                position={contextMenuTargetOffset}
                                isOpen={isContextMenuOpen}
                                onClose={() => setIsContextMenuOpen(false)}
                            />
                        )}
                    </BigNumberContainer>
                </SimpleStatisticsWrapper>
            ) : (
                <div style={{ padding: '50px 0' }}>
                    <NonIdealState
                        title="No data available"
                        description="Query metrics and dimensions with results."
                        icon="chart"
                    />
                </div>
            )}
        </>
    );
};

export default SimpleStatistic;
