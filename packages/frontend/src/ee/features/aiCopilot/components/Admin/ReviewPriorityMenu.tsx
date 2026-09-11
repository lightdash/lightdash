import { type AiAgentReviewItemPriority } from '@lightdash/common';
import { Group, Menu, Tooltip, UnstyledButton } from '@mantine/core';
import { type FC } from 'react';
import { CategoryBadge } from '../../../../../components/common/CategoryBadge';
import { useUpdateAiAgentReviewItemPriority } from '../../hooks/useAiAgentAdmin';
import {
    reviewPriorityColors,
    reviewPriorityLabels,
} from './reviewItemDetails';
import { ReviewPriorityBars } from './ReviewPriorityBars';

type Props = {
    fingerprint: string;
    priority: AiAgentReviewItemPriority;
    /** `badge` = dot + label; `bars` = compact signal-strength glyph (board cards). */
    variant?: 'badge' | 'bars';
    /** Render as a bare dot + label (no chip) — e.g. in the issue rail. */
    bordered?: boolean;
    /** Extra class for the badge — e.g. rail typography overrides. */
    className?: string;
};

const priorities: AiAgentReviewItemPriority[] = [
    'urgent',
    'high',
    'medium',
    'low',
    'none',
];

export const ReviewPriorityMenu: FC<Props> = ({
    fingerprint,
    priority,
    variant = 'badge',
    bordered = true,
    className,
}) => {
    const updatePriority = useUpdateAiAgentReviewItemPriority();

    return (
        <Menu width={160} position="bottom-start">
            <Menu.Target>
                <UnstyledButton
                    display="inline-flex"
                    aria-label={`Priority: ${reviewPriorityLabels[priority]}`}
                    className={variant === 'bars' ? className : undefined}
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    {variant === 'bars' ? (
                        <Tooltip
                            label={reviewPriorityLabels[priority]}
                            openDelay={300}
                        >
                            <Group>
                                <ReviewPriorityBars priority={priority} />
                            </Group>
                        </Tooltip>
                    ) : (
                        <CategoryBadge
                            color={reviewPriorityColors[priority]}
                            label={reviewPriorityLabels[priority]}
                            bordered={bordered}
                            className={className}
                        />
                    )}
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
                        leftSection={
                            <ReviewPriorityBars priority={nextPriority} />
                        }
                    >
                        {reviewPriorityLabels[nextPriority]}
                    </Menu.Item>
                ))}
            </Menu.Dropdown>
        </Menu>
    );
};
