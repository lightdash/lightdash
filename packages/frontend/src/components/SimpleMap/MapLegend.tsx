import {
    Compact,
    CustomFormatType,
    applyCustomFormat,
} from '@lightdash/common';
import { type FC } from 'react';
// eslint-disable-next-line css-modules/no-unused-class
import classes from './SimpleMap.module.css';

type MapLegendProps = {
    colors: string[];
    min: number;
    max: number;
};

const MapLegend: FC<MapLegendProps> = ({ colors, min, max }) => {
    // Format numbers for display using Lightdash's compact formatter
    const formatValue = (value: number): string => {
        const absValue = Math.abs(value);
        let compact: Compact | undefined;

        if (absValue >= 1000000000) {
            compact = Compact.BILLIONS;
        } else if (absValue >= 1000000) {
            compact = Compact.MILLIONS;
        } else if (absValue >= 1000) {
            compact = Compact.THOUSANDS;
        }

        return applyCustomFormat(value, {
            type: CustomFormatType.NUMBER,
            compact,
            round: compact ? 1 : Number.isInteger(value) ? 0 : 2,
        });
    };

    return (
        <div className={classes.legend}>
            <div className={classes.legendGradient}>
                {colors.map((color, index) => (
                    <div
                        key={index}
                        className={classes.legendColorStop}
                        style={{ backgroundColor: color }}
                    />
                ))}
            </div>
            <div className={classes.legendLabels}>
                <span>{formatValue(min)}</span>
                <span>{formatValue(max)}</span>
            </div>
        </div>
    );
};

export default MapLegend;
