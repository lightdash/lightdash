import { MergeJoinType } from '@lightdash/common';
import { Badge, Box } from '@mantine/core';
import { useState, type FC } from 'react';
import CollapsableCard from '../../../components/common/CollapsableCard/CollapsableCard';
import { useMergeSafe } from '../context/useMerge';
import { useMergeSetup } from '../hooks/useMergeSetup';
import { MergeJoinBar } from './MergeJoinBar';

const MergeRelationshipCardContent: FC = () => {
    const { relationshipSummary, isIncomplete, setupStep } = useMergeSetup();
    const merge = useMergeSafe();
    const [isOpen, setIsOpen] = useState(true);
    const joinTypeLabel =
        merge?.joinType === MergeJoinType.LEFT
            ? 'Left'
            : merge?.joinType === MergeJoinType.INNER
              ? 'Inner'
              : 'Full outer';
    const badgeLabel = setupStep ?? `${relationshipSummary} · ${joinTypeLabel}`;

    return (
        <CollapsableCard
            title="Relationship"
            isOpen={isOpen}
            onToggle={setIsOpen}
            headerElement={
                <Badge
                    color={isIncomplete ? 'orange' : 'gray'}
                    maw="min(70vw, 720px)"
                    title={badgeLabel}
                    styles={{
                        label: { overflow: 'hidden', textOverflow: 'ellipsis' },
                    }}
                >
                    {badgeLabel}
                </Badge>
            }
        >
            <Box px="md" pb="md">
                <MergeJoinBar guided />
            </Box>
        </CollapsableCard>
    );
};

/** The relationship belongs to the result, so it lives with result controls—not inside either dataset. */
export const MergeRelationshipCard: FC = () => {
    const merge = useMergeSafe();
    if (
        !merge?.isMerging ||
        merge.readOnly ||
        !merge.additionalSources.some((source) => source.exploreName)
    ) {
        return null;
    }

    return <MergeRelationshipCardContent />;
};
