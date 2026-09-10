import { type RoadmapProjectGroup } from '@lightdash/common';
import { Button } from '@mantine/core';
import { IconStar } from '@tabler/icons-react';
import MantineIcon from '../../../components/common/MantineIcon';

export type FollowProjectAction = {
    isLoading: boolean;
    isSubmitted: boolean;
    canFollow: boolean;
    onFollow: () => void;
};

export function FollowProjectButton({
    item,
    isLoading,
    isSubmitted,
    canFollow,
    onFollow,
    className,
    compact = false,
}: FollowProjectAction & {
    item: RoadmapProjectGroup;
    className?: string;
    compact?: boolean;
}) {
    if (!canFollow || item.hasDirectNeed || item.ownRequestCount > 0)
        return null;

    return (
        <Button
            color="indigo"
            className={className}
            size={compact ? 'compact-xs' : 'xs'}
            leftSection={
                <MantineIcon icon={IconStar} size={compact ? 12 : 16} />
            }
            loading={isLoading}
            disabled={isSubmitted}
            onClick={onFollow}
        >
            {isSubmitted ? 'Request sent' : 'Follow'}
        </Button>
    );
}
