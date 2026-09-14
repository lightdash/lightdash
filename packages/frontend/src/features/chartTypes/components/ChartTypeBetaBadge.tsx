import { Badge } from '@mantine/core';
import { type FC } from 'react';

/** Marks a registry chart type published on the beta channel. */
const ChartTypeBetaBadge: FC = () => (
    <Badge size="xs" variant="light" color="yellow">
        Beta
    </Badge>
);

export default ChartTypeBetaBadge;
