import { LOADING_CHART_CLASS } from '@lightdash/common';
import { clsx } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import SuboptimalState from './SuboptimalState/SuboptimalState';
type LoadingChartProps = {
    children?: ReactNode;
    className?: string;
};

/**
 * Standard loading chart component that ALWAYS applies the LOADING_CHART_CLASS.
 * This class is critical for the screenshot/unfurl service to detect loading states.
 *
 * IMPORTANT: Always use this component instead of manually creating loading states
 * to ensure the unfurl service can properly detect when charts are loading.
 */
const LoadingChart: FC<LoadingChartProps> = ({ children, className }) => {
    return (
        <div
            style={{ height: '100%', width: '100%', padding: '50px 0' }}
            className={clsx(LOADING_CHART_CLASS, className)}
        >
            {children || <SuboptimalState title="Loading chart" loading />}
        </div>
    );
};

export default LoadingChart;
