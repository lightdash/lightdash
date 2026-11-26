import { Badge } from '@mantine/core';
import { type FC } from 'react';

/** How many review requests are waiting on the viewer. */
const ReviewRequestCountBadge: FC<{ count: number }> = ({ count }) => (
    <Badge size="xs" color="yellow" variant="light" circle>
        {count}
    </Badge>
);

export default ReviewRequestCountBadge;
