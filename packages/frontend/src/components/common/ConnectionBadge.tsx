import { Badge } from '@mantine/core';
import { type FC } from 'react';

type Props = {
    name: string | null;
};

const ConnectionBadge: FC<Props> = ({ name }) =>
    name === null ? null : (
        <Badge size="xs" variant="light" color="gray" style={{ flexShrink: 0 }}>
            {name}
        </Badge>
    );

export default ConnectionBadge;
