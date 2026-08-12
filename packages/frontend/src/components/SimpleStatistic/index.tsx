import { isField } from '@lightdash/common';
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
    /**
     * When the tile title is hidden it no longer carries the description
     * tooltip, so the big number and its label take it over instead.
     */
    isTitleHidden?: boolean;
    /** Chart description, used when the tile title is hidden. */
    description?: string;
    onScreenshotReady?: () => void;
    onScreenshotError?: () => void;
}

const SimpleStatistic: FC<SimpleStatisticsProps> = ({
    minimal = false,
    isTitleHidden = false,
    description,
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
        getField,
        selectedField,
    } = visualizationConfig.chartConfig;

    const selectedItem = selectedField ? getField(selectedField) : undefined;
    // Fall back to the metric's own description when the chart has none.
    const hoverDescription = isTitleHidden
        ? (description ??
          (selectedItem && isField(selectedItem)
              ? selectedItem.description
              : undefined))
        : undefined;

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
            description={hoverDescription}
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
