/**
 * Renders a bar chart display for positive numeric values in table cells.
 */
import { type ReactElement } from 'react';

type BarChartDisplayProps = {
    value: number;
    formatted: string;
    min: number;
    max: number;
    color?: string;
};

export const renderBarChartDisplay = ({
    value,
    formatted,
    min,
    max,
    color = '#5470c6',
}: BarChartDisplayProps): ReactElement => {
    // Calculate bar width percentage
    const range = max - min;
    const percentage =
        range > 0
            ? Math.max(0, Math.min(100, ((value - min) / range) * 100))
            : 0;

    // Only show bar for positive numbers
    const showBar = value > 0;

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
            }}
        >
            {showBar && (
                <div
                    style={{
                        width: `${percentage}%`,
                        minWidth: '2px', // Always show visible bar for positive values
                        height: '20px',
                        backgroundColor: color,
                        borderRadius: '2px',
                    }}
                />
            )}
            <span style={{ whiteSpace: 'nowrap' }}>{formatted}</span>
        </div>
    );
};
