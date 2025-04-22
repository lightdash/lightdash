import { FeatureFlags } from '@lightdash/common';
import { Paper, ScrollArea } from '@mantine/core';
import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import Tree from '../Tree/Tree';
import { type NestableItem } from '../Tree/types';

type SpaceSelectorProps = {
    spaces: Array<NestableItem> | undefined;
    selectedSpaceUuid: string | null;
    onSelectSpace: (spaceUuid: string | null) => void;
    isLoading?: boolean;
};

const SpaceSelector = ({
    spaces = [],
    selectedSpaceUuid,
    onSelectSpace,
}: SpaceSelectorProps) => {
    const isNestedSpacesEnabled = useFeatureFlagEnabled(
        FeatureFlags.NestedSpaces,
    );

    if (isNestedSpacesEnabled) {
        return (
            <Paper
                component={ScrollArea}
                w="100%"
                h="200px"
                withBorder
                px="sm"
                py="xs"
            >
                <Tree
                    data={spaces}
                    value={selectedSpaceUuid}
                    onChange={onSelectSpace}
                    topLevelLabel="Spaces"
                />
            </Paper>
        );
    }

    return null;
};

export default SpaceSelector;
