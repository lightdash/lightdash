import type EChartsReactClass from 'echarts-for-react';
import EChartsReact from 'echarts-for-react';
import { forwardRef } from 'react';

/**
 * Usage:
 * ```tsx
 * import EChartsReact from './components/EChartsReactWrapper';
 *
 * <EChartsReact option={chartOption} />
 * ```
 */
const EChartsReactWrapper = forwardRef<
    EChartsReactClass,
    React.ComponentProps<typeof EChartsReactClass>
>((props, ref) => {
    return <EChartsReact {...props} ref={ref as any} />;
});

EChartsReactWrapper.displayName = 'EChartsReactWrapper';

export default EChartsReactWrapper;

export type { default as EChartsReact } from 'echarts-for-react';

export type {
    EChartsInstance,
    EChartsOption,
    EChartsReactProps,
} from 'echarts-for-react';
