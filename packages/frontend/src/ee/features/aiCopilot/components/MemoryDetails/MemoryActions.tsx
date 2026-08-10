import { type AiAgentMemory } from '@lightdash/common';
import { Group } from '@mantine/core';
import { type FC } from 'react';
import { MemoryPromotionAction } from './MemoryPromotionAction';
import { MemoryStatusAction } from './MemoryStatusControls';

type Props = {
    projectUuid: string;
    memory: Pick<
        AiAgentMemory,
        'uuid' | 'slug' | 'status' | 'promotionReviewItem'
    >;
};

export const MemoryActions: FC<Props> = ({ projectUuid, memory }) => (
    <Group gap="xs">
        <MemoryPromotionAction
            projectUuid={projectUuid}
            memoryUuid={memory.uuid}
            slug={memory.slug}
            status={memory.status}
            promotionReviewItem={memory.promotionReviewItem}
        />
        <MemoryStatusAction
            projectUuid={projectUuid}
            memoryUuid={memory.uuid}
            slug={memory.slug}
            status={memory.status}
        />
    </Group>
);
