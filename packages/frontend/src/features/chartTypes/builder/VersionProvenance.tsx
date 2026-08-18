import { Text, type TextProps } from '@mantine/core';
import { type FC } from 'react';
import { useTimeAgo } from '../../../hooks/useTimeAgo';

type Props = {
    authorName: string | null;
    at: Date;
    /** False while older versions are unloaded — the oldest we can see may not be v1. */
    isOrigin: boolean;
} & Pick<TextProps, 'className'>;

/** Where a visualization came from: "Built by X · 3 days ago". */
const VersionProvenance: FC<Props> = ({
    authorName,
    at,
    isOrigin,
    className,
}) => {
    const timeAgo = useTimeAgo(at);
    const verb = isOrigin ? 'Built' : 'Last updated';
    return (
        <Text size="xs" c="dimmed" truncate="end" className={className}>
            {authorName
                ? `${verb} by ${authorName} · ${timeAgo}`
                : `${verb} ${timeAgo}`}
        </Text>
    );
};

export default VersionProvenance;
