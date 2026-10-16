import { type RoadmapProjectGroup } from '@lightdash/common';
import { Button } from '@mantine/core';
import { useTranslation } from 'react-i18next';

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
    const { t } = useTranslation('eeMisc');
    if (!canFollow || item.hasDirectNeed || item.ownRequestCount > 0)
        return null;

    return (
        <Button
            className={className}
            size={compact ? 'compact-xs' : 'xs'}
            loading={isLoading}
            disabled={isSubmitted}
            onClick={onFollow}
        >
            {isSubmitted
                ? t('roadmap.follow.sent')
                : t('roadmap.follow.follow')}
        </Button>
    );
}
