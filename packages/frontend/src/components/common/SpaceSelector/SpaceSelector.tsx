import { subject } from '@casl/ability';
import {
    assertUnreachable,
    type ResourceViewItemType,
    type SpaceSummary,
} from '@lightdash/common';
import { Paper, ScrollArea, Stack, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useMemo, useState } from 'react';
import { hasDirectAccessToSpace } from '../../../hooks/useSpaces';
import useApp from '../../../providers/App/useApp';
import AdminContentViewFilter from '../ResourceView/AdminContentViewFilter';
import Tree from '../Tree/Tree';
import { type NestableItem } from '../Tree/types';
import useFuzzyTreeSearch from '../Tree/useFuzzyTreeSearch';

type SpaceSelectorProps = {
    projectUuid: string | undefined;
    selectedSpaceUuid: string | null;
    spaces:
        | Array<Pick<SpaceSummary, 'isPrivate' | 'access'> & NestableItem>
        | undefined;
    isLoading?: boolean;
    itemType: ResourceViewItemType | undefined;
    onSelectSpace: (spaceUuid: string | null) => void;
    isRootSelectionEnabled?: boolean;
};

const SpaceSelector = ({
    projectUuid,
    selectedSpaceUuid,
    spaces = [],
    isLoading: _isLoading, // TODO: implement loading state for the tree.
    onSelectSpace,
    children,
    isRootSelectionEnabled,
}: React.PropsWithChildren<SpaceSelectorProps>) => {
    const { user } = useApp();

    const userCanManageProject = user.data?.ability?.can(
        'manage',
        subject('Project', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid: projectUuid,
        }),
    );

    const [selectedAdminContentType, setSelectedAdminContentType] = useState<
        'all' | 'shared'
    >(userCanManageProject ? 'shared' : 'all');

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

    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery] = useDebouncedValue(searchQuery, 200);

    const fuzzyFilteredSpaces = useFuzzyTreeSearch(
        filteredSpaces,
        debouncedSearchQuery,
    );

    return (
        <Stack h="600px">
            {userCanManageProject ? (
                <AdminContentViewFilter
                    value={selectedAdminContentType}
                    onChange={setSelectedAdminContentType}
                    withDivider={false}
                    segmentedControlProps={{
                        sx: {
                            flexShrink: 0,
                        },
                    }}
                />
            ) : null}

            <TextInput
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search spaces"
            />

            <Paper
                component={ScrollArea}
                w="100%"
                sx={{ flexGrow: 1 }}
                withBorder
            >
                <Tree
                    withRootSelectable={isRootSelectionEnabled}
                    data={fuzzyFilteredSpaces ?? filteredSpaces}
                    value={selectedSpaceUuid}
                    onChange={onSelectSpace}
                    topLevelLabel="Spaces"
                    isExpanded={fuzzyFilteredSpaces !== undefined}
                />
            </Paper>

            {children}
        </Stack>
    );
};

export default SpaceSelector;
