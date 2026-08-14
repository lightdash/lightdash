import { Badge, Box } from '@mantine/core';
import { useState, type FC } from 'react';
import CollapsableCard from '../../../components/common/CollapsableCard/CollapsableCard';
import { useMergeSafe } from '../context/useMerge';
import { useMergeSetup } from '../hooks/useMergeSetup';
import { MergeJoinBar } from './MergeJoinBar';

const MergeRelationshipCardContent: FC = () => {
    const { exploreALabel, exploreBLabel, isIncomplete } = useMergeSetup();
    const [isOpen, setIsOpen] = useState(true);

    return (
        <CollapsableCard
            title="Relationship"
            isOpen={isOpen}
            onToggle={setIsOpen}
            headerElement={
                <Badge variant="light" color={isIncomplete ? 'orange' : 'gray'}>
                    {isIncomplete
                        ? 'Needs a matching field'
                        : `${exploreALabel ?? 'First data'} + ${
                              exploreBLabel ?? 'combined data'
                          }`}
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
    if (!merge?.isMerging || merge.readOnly || !merge.queryB.exploreName) {
        return null;
    }

    return <MergeRelationshipCardContent />;
};
