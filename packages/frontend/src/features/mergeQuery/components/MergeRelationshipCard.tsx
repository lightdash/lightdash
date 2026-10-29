import { Badge, Box } from '@mantine/core';
import { useState, type FC } from 'react';
import CollapsableCard from '../../../components/common/CollapsableCard/CollapsableCard';
import { useMergeSafe } from '../context/useMerge';
import { useMergeSetup } from '../hooks/useMergeSetup';
import { MergeJoinBar } from './MergeJoinBar';
import classes from './MergeRelationshipCard.module.css';

const MergeRelationshipCardContent: FC = () => {
    const { keySummary, joinTypeLabel, sourceLabels, isIncomplete, setupStep } =
        useMergeSetup();
    const [isOpen, setIsOpen] = useState(true);
    const relationshipLabel =
        sourceLabels.length > 2
            ? `${sourceLabels.length} sources · ${keySummary} · ${joinTypeLabel}`
            : `${keySummary} · ${joinTypeLabel}`;
    const badgeLabel = setupStep ?? relationshipLabel;

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
                    classNames={{ label: classes.badgeLabel }}
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
