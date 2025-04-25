import { subject } from '@casl/ability';
import {
    assertUnreachable,
    FeatureFlags,
    type SpaceSummary,
} from '@lightdash/common';
import {
    Paper,
    ScrollArea,
    Stack,
    type PaperProps,
    type ScrollAreaProps,
} from '@mantine/core';
import { useMemo, useState } from 'react';
import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import { hasDirectAccessToSpace } from '../../../hooks/useSpaces';
import useApp from '../../../providers/App/useApp';
import AdminContentViewFilter from '../ResourceView/AdminContentViewFilter';
import Tree from '../Tree/Tree';
import { type NestableItem } from '../Tree/types';

type SpaceSelectorProps = {
    spaces:
        | Array<Pick<SpaceSummary, 'isPrivate' | 'access'> & NestableItem>
        | undefined;
    selectedSpaceUuid: string | null;
    scrollingContainerProps?: PaperProps & ScrollAreaProps;
    isLoading?: boolean;
    onSelectSpace: (spaceUuid: string | null) => void;
    projectUuid: string | undefined;
};

const SpaceSelector = ({
    spaces = [],
    selectedSpaceUuid,
    scrollingContainerProps,
    isLoading: _isLoading, // TODO: implement loading state for the tree.
    onSelectSpace,
    projectUuid,
}: SpaceSelectorProps) => {
    const { user } = useApp();

    const userCanManageProject = user.data?.ability?.can(
        'manage',
        subject('Project', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid: projectUuid,
        }),
    );

    const isNestedSpacesEnabled = useFeatureFlagEnabled(
        FeatureFlags.NestedSpaces,
    );

    const [selectedAdminContentType, setSelectedAdminContentType] = useState<
        'all' | 'shared'
    >('shared');

    const filteredSpaces = useMemo(() => {
        if (!user.data) return [];

        switch (selectedAdminContentType) {
            case 'all':
                return spaces;
            case 'shared':
                return spaces.filter((space) =>
                    hasDirectAccessToSpace(space, user.data.userUuid),
                );
            default:
                return assertUnreachable(
                    selectedAdminContentType,
                    `Invalid admin content type when filtering spaces: ${selectedAdminContentType}`,
                );
        }
    }, [user.data, selectedAdminContentType, spaces]);

    if (isNestedSpacesEnabled) {
        return (
            <Stack>
                {userCanManageProject ? (
                    <AdminContentViewFilter
                        value={selectedAdminContentType}
                        onChange={setSelectedAdminContentType}
                        withDivider={false}
                    />
                ) : null}

                <Paper
                    component={ScrollArea}
                    w="100%"
                    h="200px"
                    withBorder
                    {...scrollingContainerProps}
                >
                    <Tree
                        data={filteredSpaces}
                        value={selectedSpaceUuid}
                        onChange={onSelectSpace}
                        topLevelLabel="Spaces"
                    />
                </Paper>
            </Stack>
        );
    }

    return null;
};

export default SpaceSelector;
