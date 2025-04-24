import { FeatureFlags } from '@lightdash/common';
import {
    Paper,
    ScrollArea,
    type PaperProps,
    type ScrollAreaProps,
} from '@mantine/core';
import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import Tree from '../Tree/Tree';
import { type NestableItem } from '../Tree/types';

type SpaceSelectorProps = {
    spaces: Array<NestableItem> | undefined;
    selectedSpaceUuid: string | null;
    scrollingContainerProps?: PaperProps & ScrollAreaProps;
    isLoading?: boolean;
    onSelectSpace: (spaceUuid: string | null) => void;
};

const SpaceSelector = ({
    spaces = [],
    selectedSpaceUuid,
    scrollingContainerProps,
    isLoading: _isLoading, // TODO: implement loading state for the tree.
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
                {...scrollingContainerProps}
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
