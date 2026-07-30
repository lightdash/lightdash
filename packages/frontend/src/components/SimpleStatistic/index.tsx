import { useEffect, useRef, type FC, type HTMLAttributes } from 'react';
import { useContextMenuPermissions } from '../../hooks/useContextMenuPermissions';
import { useAccount } from '../../hooks/user/useAccount';
import { BigNumberDisplay } from '../common/BigNumber/BigNumberDisplay';
import LoadingChart from '../common/LoadingChart';
import { isBigNumberVisualizationConfig } from '../LightdashVisualization/types';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import { EmptyChart } from '../SimpleChart';
import BigNumberContextMenu from './BigNumberContextMenu';

interface SimpleStatisticsProps extends HTMLAttributes<HTMLDivElement> {
    minimal?: boolean;
    onScreenshotReady?: () => void;
    onScreenshotError?: () => void;
}

const SimpleStatistic: FC<SimpleStatisticsProps> = ({
    minimal = false,
    onScreenshotReady,
    onScreenshotError,
    ...wrapperProps
}) => {
    const { data: account } = useAccount();
    const { shouldShowMenu, canViewUnderlyingData, canDrillInto } =
        useContextMenuPermissions({
            minimal,
        });

    const { resultsData, isLoading, visualizationConfig } =
        useVisualizationContext();

    const isBigNumber = isBigNumberVisualizationConfig(visualizationConfig);

    const hasSignaledScreenshotReady = useRef(false);

    useEffect(() => {
        if (hasSignaledScreenshotReady.current) return;
        if (!onScreenshotReady && !onScreenshotError) return;

        if (!isLoading) {
            onScreenshotReady?.();
            hasSignaledScreenshotReady.current = true;
        }
    }, [isLoading, onScreenshotReady, onScreenshotError]);

    if (!isBigNumber) return null;

    const {
        bigNumber,
        bigNumberTextColor,
        showBigNumberLabel,
        resolvedBigNumberLabel,
        defaultLabel,
        showComparison,
        comparisonTooltip,
        resolvedComparisonLabel,
        comparisonValue,
        comparisonDiff,
        flipColors,
    } = visualizationConfig.chartConfig;

    if (isLoading) return <LoadingChart />;

    if (!bigNumber || !resultsData?.rows.length) return <EmptyChart />;

    const shouldHideContextMenu =
        !shouldShowMenu ||
        (account?.authentication.type === 'jwt' && !canViewUnderlyingData);

    return (
        <BigNumberDisplay
            value={bigNumber}
            label={resolvedBigNumberLabel || defaultLabel || ''}
            showLabel={!!showBigNumberLabel}
            valueColor={bigNumberTextColor}
            flipColors={!!flipColors}
            comparison={
                showComparison
                    ? {
                          formattedValue: comparisonValue,
                          direction: comparisonDiff,
                          label: resolvedComparisonLabel,
                          tooltip: comparisonTooltip ?? '',
                      }
                    : undefined
            }
            renderValue={
                shouldHideContextMenu
                    ? undefined
                    : (value) => (
                          <BigNumberContextMenu
                              isMinimal={minimal}
                              canDrillInto={canDrillInto}
                              canViewUnderlyingData={canViewUnderlyingData}
                          >
                              {value}
                          </BigNumberContextMenu>
                      )
            }
            {...wrapperProps}
        />
    );
};

export default SimpleStatistic;
