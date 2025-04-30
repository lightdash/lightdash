import { subject } from '@casl/ability';
import { assertUnreachable, type SpaceSummary } from '@lightdash/common';
import { Paper, ScrollArea, Stack } from '@mantine/core';
import { useMemo, useState } from 'react';
import { hasDirectAccessToSpace } from '../../../hooks/useSpaces';
import useApp from '../../../providers/App/useApp';
import AdminContentViewFilter from '../ResourceView/AdminContentViewFilter';
import Tree from '../Tree/Tree';
import { type NestableItem } from '../Tree/types';

type SpaceSelectorProps = {
    projectUuid: string | undefined;
    selectedSpaceUuid: string | null;
    spaces:
        | Array<Pick<SpaceSummary, 'isPrivate' | 'access'> & NestableItem>
        | undefined;
    isLoading?: boolean;
    onSelectSpace: (spaceUuid: string | null) => void;
};

const SpaceSelector = ({
    projectUuid,
    selectedSpaceUuid,
    spaces = [],
    isLoading: _isLoading, // TODO: implement loading state for the tree.
    onSelectSpace,
    children,
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

    return (
        <Stack h="400px">
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

            <Paper
                component={ScrollArea}
                w="100%"
                sx={{ flexGrow: 1 }}
                withBorder
            >
                <Tree
                    data={filteredSpaces}
                    value={selectedSpaceUuid}
                    onChange={onSelectSpace}
                    topLevelLabel="Spaces"
                />
            </Paper>

            {children}
        </Stack>
    );
};

export default SpaceSelector;
