import { Badge } from '@mantine-8/core';

type MemoryCitationProps = {
    id?: string;
};

export const MemoryCitation = ({ id }: MemoryCitationProps) => {
    const memoryId = id?.replace(/^user-content-/, '');

    return (
        <Badge
            component="span"
            color="violet"
            mx={2}
            radius="sm"
            size="xs"
            title={memoryId ? `Memory: ${memoryId}` : 'Memory'}
            variant="light"
        >
            Memory
        </Badge>
    );
};
