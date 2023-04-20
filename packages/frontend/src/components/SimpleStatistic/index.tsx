import clamp from 'lodash-es/clamp';
import React, { FC, useEffect, useMemo, useRef, useState } from 'react';
import {
    TILE_HEADER_HEIGHT,
    TILE_HEADER_MARGIN_BOTTOM,
} from '../DashboardTiles/TileBase/TileBase.styles';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { EmptyChart, LoadingChart } from '../SimpleChart';
import { BigNumberContextMenu } from './BigNumberContextMenu';
import {
    BigNumber,
    BigNumberContainer,
    BigNumberHalf,
    BigNumberLabel,
} from './SimpleStatistics.styles';

interface SimpleStatisticsProps extends React.HTMLAttributes<HTMLDivElement> {
    minimal?: boolean;
    isDashboard?: boolean;
    isTitleHidden?: boolean;
}

const BOX_MIN_WIDTH = 150;
const BOX_MAX_WIDTH = 1000;

const VALUE_SIZE_MIN = 24;
const VALUE_SIZE_MAX = 64;

const LABEL_SIZE_MIN = 14;
const LABEL_SIZE_MAX = 32;

const calculateFontSize = (
    fontSizeMin: number,
    fontSizeMax: number,
    boundWidth: number,
) =>
    Math.floor(
        fontSizeMin +
            ((fontSizeMax - fontSizeMin) * (boundWidth - BOX_MIN_WIDTH)) /
                (BOX_MAX_WIDTH - BOX_MIN_WIDTH),
    );

type ObserverRect = Omit<DOMRectReadOnly, 'toJSON'>;

const defaultState: ObserverRect = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
};

export function useResizeObserver<T extends HTMLElement = any>() {
    const frameID = useRef(0);
    const [ref, setState] = useState<T | null>(null);

    const [rect, setRect] = useState<ObserverRect>(defaultState);

    const observer = useMemo(
        () =>
            typeof window !== 'undefined'
                ? new ResizeObserver((entries: any) => {
                      const entry = entries[0];

                      console.log(entry, 'this happens');

                      if (entry) {
                          cancelAnimationFrame(frameID.current);

                          frameID.current = requestAnimationFrame(() => {
                              if (ref) {
                                  setRect(entry.contentRect);
                              }
                          });
                      }
                  })
                : null,
        [ref],
    );

    useEffect(() => {
        if (ref) {
            console.log('observe', ref, observer);
            observer?.observe(ref);
        }

        return () => {
            observer?.disconnect();

            if (frameID.current) {
                cancelAnimationFrame(frameID.current);
            }
        };
    }, [ref, observer]);

    return [setState, rect] as const;
}

const SimpleStatistic: FC<SimpleStatisticsProps> = ({
    minimal = false,
    isDashboard = false,
    isTitleHidden = false,
    ...wrapperProps
}) => {
    const {
        resultsData,
        isLoading,
        bigNumberConfig: { bigNumber, bigNumberLabel, defaultLabel },
        isSqlRunner,
    } = useVisualizationContext();

    const [setRef, observerElementSize] = useResizeObserver();

    const { valueFontSize, labelFontSize } = useMemo(() => {
        const boundWidth = clamp(
            observerElementSize?.width || 0,
            BOX_MIN_WIDTH,
            BOX_MAX_WIDTH,
        );

        const valueSize = calculateFontSize(
            VALUE_SIZE_MIN,
            VALUE_SIZE_MAX,
            boundWidth,
        );

        const labelSize = calculateFontSize(
            LABEL_SIZE_MIN,
            LABEL_SIZE_MAX,
            boundWidth,
        );

        return {
            valueFontSize: valueSize,
            labelFontSize: labelSize,
        };
    }, [observerElementSize]);

    // const [count, setCount] = useState(0);
    // useEffect(() => {
    //     const timer = setTimeout(() => {
    //         setCount(count + 1);
    //     }, 1000);

    //     return () => clearTimeout(timer);
    // }, [resizeObserverRef, resizeObserverRef.current]);

    const validData = bigNumber && resultsData?.rows.length;

    if (isLoading) return <LoadingChart />;

    return validData ? (
        <BigNumberContainer
            $paddingBottom={
                isDashboard && isTitleHidden
                    ? TILE_HEADER_HEIGHT + TILE_HEADER_MARGIN_BOTTOM - 8
                    : TILE_HEADER_HEIGHT
            }
            ref={(elem) => setRef(elem)}
            {...wrapperProps}
        >
            <BigNumberHalf>
                {minimal || isSqlRunner ? (
                    <BigNumber $fontSize={valueFontSize}>{bigNumber}</BigNumber>
                ) : (
                    <BigNumberContextMenu
                        renderTarget={({ ref, onClick }) => (
                            <BigNumber
                                $interactive
                                ref={ref}
                                onClick={onClick}
                                $fontSize={valueFontSize}
                            >
                                {bigNumber}
                            </BigNumber>
                        )}
                    />
                )}
            </BigNumberHalf>

            <BigNumberHalf>
                <BigNumberLabel $fontSize={labelFontSize}>
                    {bigNumberLabel || defaultLabel}
                </BigNumberLabel>
            </BigNumberHalf>
        </BigNumberContainer>
    ) : (
        <EmptyChart />
    );
};

export default SimpleStatistic;
