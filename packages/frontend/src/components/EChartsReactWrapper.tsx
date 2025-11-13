import type EChartsReactClass from 'echarts-for-react';
import EChartsReactV5 from 'echarts-for-react';
import EChartsReactV6 from 'echarts-for-react-6';
import { forwardRef } from 'react';
import useHealth from '../hooks/health/useHealth';

/**
 * Wrapper component that conditionally loads echarts-for-react v5 or v6
 * based on the echartsVersion from health endpoint.
 *
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
    const healthQuery = useHealth();

    const Component = healthQuery.data?.echarts6.enabled
        ? EChartsReactV6
        : EChartsReactV5;

    return <Component {...props} ref={ref as any} />;
});

EChartsReactWrapper.displayName = 'EChartsReactWrapper';

export default EChartsReactWrapper;

export type { default as EChartsReact } from 'echarts-for-react';

export type {
    EChartsInstance,
    EChartsOption,
    EChartsReactProps,
} from 'echarts-for-react';
