import { Badge } from '@mantine/core';
import { type FC } from 'react';

/** Marks a chart type installed from the official chart registry. */
const OfficialChartTypeBadge: FC = () => (
    <Badge size="xs" variant="light" color="violet">
        Built by Lightdash
    </Badge>
);

export default OfficialChartTypeBadge;
