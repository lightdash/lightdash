import { Icon123, IconAbc, IconClockHour4 } from '@tabler/icons-react';
import { forwardRef } from 'react';
import {
    MetricFlowDimensionType,
    type MetricFlowMetricType,
} from '../../../api/MetricFlowAPI';
import MantineIcon, {
    type MantineIconProps,
} from '../../../components/common/MantineIcon';

type Props = Omit<MantineIconProps, 'icon'> & {
    type: MetricFlowDimensionType | MetricFlowMetricType;
};

const MetricFlowFieldIcon = forwardRef<SVGSVGElement, Props>(
    ({ type, size = 'lg', ...iconProps }, ref) => {
        const iconColor =
            iconProps.color ??
            Object.values(MetricFlowDimensionType).includes(
                type as MetricFlowDimensionType,
            )
                ? '#0E5A8A'
                : '#A66321';
        const props = {
            ...iconProps,
            ref,
            size,
            color: iconColor,
        };

        switch (type) {
            case MetricFlowDimensionType.CATEGORICAL:
                return <MantineIcon icon={IconAbc} {...props} />;
            case MetricFlowDimensionType.TIME:
                return <MantineIcon icon={IconClockHour4} {...props} />;
            default:
                return <MantineIcon icon={Icon123} {...props} />;
        }
    },
);

export default MetricFlowFieldIcon;
