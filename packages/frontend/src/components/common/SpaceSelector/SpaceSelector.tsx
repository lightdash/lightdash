import { subject } from '@casl/ability';
import {
    assertUnreachable,
    type ResourceViewItemType,
    type SpaceSummary,
} from '@lightdash/common';
import { Paper, Stack, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useMemo, useState } from 'react';
import { hasDirectAccessToSpace } from '../../../hooks/useSpaces';
import useApp from '../../../providers/App/useApp';
import AdminContentViewFilter from '../ResourceView/AdminContentViewFilter';
import Tree from '../Tree/Tree';
import { type NestableItem } from '../Tree/types';
import useFuzzyTreeSearch from '../Tree/useFuzzyTreeSearch';

type SpaceItem = Pick<
    SpaceSummary,
    'isPrivate' | 'access' | 'parentSpaceUuid'
> &
    NestableItem;

type SpaceSelectorProps = {
    projectUuid: string | undefined;
    selectedSpaceUuid: string | null;
    spaces: SpaceItem[] | undefined;
    isLoading?: boolean;
    itemType: ResourceViewItemType | undefined;
    onSelectSpace: (spaceUuid: string | null) => void;
    isRootSelectionEnabled?: boolean;
};

/**
 * Rebuilds paths using uuid segments to guarantee uniqueness.
 * DB paths can collide (lossy slug→ltree conversion), but parentSpaceUuid
 * relationships are always correct. This builds a uuid-based path hierarchy.
 */
function buildUniquePaths<
    T extends NestableItem & { parentSpaceUuid: string | null },
>(items: T[]): T[] {
    const uuidToNewPath = new Map<string, string>();
    const remaining = [...items];
    const result: T[] = [];

    // Process in topological order: roots first, then children
    while (remaining.length > 0) {
        const prevLength = remaining.length;
        const nextRemaining: T[] = [];

        for (const item of remaining) {
            if (!item.parentSpaceUuid) {
                uuidToNewPath.set(item.uuid, item.uuid);
                result.push({ ...item, path: item.uuid });
            } else if (uuidToNewPath.has(item.parentSpaceUuid)) {
                const parentPath = uuidToNewPath.get(item.parentSpaceUuid)!;
                const newPath = `${parentPath}.${item.uuid}`;
                uuidToNewPath.set(item.uuid, newPath);
                result.push({ ...item, path: newPath });
            } else {
                nextRemaining.push(item);
            }
        }

        if (nextRemaining.length === prevLength) {
            // No progress — orphans whose parents were filtered out; treat as roots
            for (const item of nextRemaining) {
                uuidToNewPath.set(item.uuid, item.uuid);
                result.push({ ...item, path: item.uuid });
            }
            break;
        }

        remaining.length = 0;
        remaining.push(...nextRemaining);
    }

    return result;
}

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

    const spacesWithUniquePaths = useMemo(
        () => buildUniquePaths(spaces),
        [spaces],
    );

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
                return spacesWithUniquePaths;
            case 'shared':
                return spacesWithUniquePaths.filter((space) =>
                    hasDirectAccessToSpace(space, user.data.userUuid),
                );
            default:
                return assertUnreachable(
                    selectedAdminContentType,
                    `Invalid admin content type when filtering spaces: ${selectedAdminContentType}`,
                );
        }
    }, [user.data, selectedAdminContentType, spacesWithUniquePaths]);

    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery] = useDebouncedValue(searchQuery, 200);

    const fuzzyFilteredSpaces = useFuzzyTreeSearch(
        filteredSpaces,
        debouncedSearchQuery,
    );

    return (
        <Stack>
            {userCanManageProject ? (
                <AdminContentViewFilter
                    value={selectedAdminContentType}
                    onChange={setSelectedAdminContentType}
                    withDivider={false}
                    segmentedControlProps={{
                        flex: '0 0 auto',
                    }}
                />
            ) : null}

            <TextInput
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search spaces"
            />

            <Paper w="100%" h={400} style={{ overflow: 'auto' }} withBorder>
                <Tree
                    withRootSelectable={isRootSelectionEnabled}
                    data={fuzzyFilteredSpaces ?? filteredSpaces}
                    value={selectedSpaceUuid}
                    onChange={onSelectSpace}
                    topLevelLabel="Spaces"
                    isExpanded={fuzzyFilteredSpaces !== undefined}
                    type="single"
                />
            </Paper>

            {children}
        </Stack>
    );
};

export default SpaceSelector;
