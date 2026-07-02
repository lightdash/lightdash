import { type AiAgentReviewItemPriority } from '@lightdash/common';
import { Menu, UnstyledButton } from '@mantine-8/core';
import { type FC } from 'react';
import { CategoryBadge } from '../../../../../components/common/CategoryBadge';
import { useUpdateAiAgentReviewItemPriority } from '../../hooks/useAiAgentAdmin';
import {
    reviewPriorityColors,
    reviewPriorityLabels,
} from './reviewItemDetails';

type Props = {
    fingerprint: string;
    priority: AiAgentReviewItemPriority;
};

const priorities: AiAgentReviewItemPriority[] = [
    'urgent',
    'high',
    'medium',
    'low',
    'none',
];

export const ReviewPriorityMenu: FC<Props> = ({ fingerprint, priority }) => {
    const updatePriority = useUpdateAiAgentReviewItemPriority();

    return (
        <Menu width={160} position="bottom-start" shadow="sm" withinPortal>
            <Menu.Target>
                <UnstyledButton
                    aria-label="Change priority"
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <CategoryBadge
                        color={reviewPriorityColors[priority]}
                        label={reviewPriorityLabels[priority]}
                    />
                </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
            >
                {priorities.map((nextPriority) => (
                    <Menu.Item
                        key={nextPriority}
                        disabled={
                            nextPriority === priority ||
                            updatePriority.isLoading
                        }
                        onClick={() =>
                            updatePriority.mutate({
                                fingerprint,
                                priority: nextPriority,
                            })
                        }
                    >
                        {reviewPriorityLabels[nextPriority]}
                    </Menu.Item>
                ))}
            </Menu.Dropdown>
        </Menu>
    );
};
