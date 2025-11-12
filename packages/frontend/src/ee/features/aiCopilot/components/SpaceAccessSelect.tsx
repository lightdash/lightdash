import {
    Box,
    Button,
    Checkbox,
    Collapse,
    Group,
    Paper,
    rem,
    Stack,
    Text,
    Tree,
    useTree,
    type RenderTreeNodePayload,
} from '@mantine-8/core';
import { IconChevronDown, IconX } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { type NestableItem } from '../../../../components/common/Tree/types';
import { convertNestableListToTree } from '../../../../components/common/Tree/utils';
import { useSpaceSummaries } from '../../../../hooks/useSpaces';
import classes from './SpaceAccessSelect.module.css';

type SpaceAccessSelectProps = {
    projectUuid: string;
    value: string[];
    onChange: (value: string[]) => void;
};

type SpaceNestableItem = NestableItem & {
    parentUuid: string | null;
};

export const SpaceAccessSelect: FC<SpaceAccessSelectProps> = ({
    projectUuid,
    value,
    onChange,
}) => {
    const { data: allSpaces, isLoading } = useSpaceSummaries(projectUuid, true);
    const [isOpen, setIsOpen] = useState(false);

    // Convert spaces to nestable items with proper paths
    const spaceItems = useMemo<SpaceNestableItem[]>(() => {
        if (!allSpaces) return [];

        // Build a map of space UUID to space for quick lookup
        const spaceMap = new Map(allSpaces.map((space) => [space.uuid, space]));

        // Build path for each space by traversing up the parent chain
        const buildPath = (spaceUuid: string): string => {
            const space = spaceMap.get(spaceUuid);
            if (!space) return spaceUuid;

            if (!space.parentSpaceUuid) {
                return space.uuid;
            }

            const parentPath = buildPath(space.parentSpaceUuid);
            return `${parentPath}.${space.uuid}`;
        };

        return allSpaces.map((space) => ({
            uuid: space.uuid,
            name: space.name,
            path: buildPath(space.uuid),
            parentUuid: space.parentSpaceUuid ?? null,
        }));
    }, [allSpaces]);

    const treeData = useMemo(
        () => convertNestableListToTree(spaceItems),
        [spaceItems],
    );

    // Convert UUIDs to paths for tree state
    const checkedPaths = useMemo(() => {
        return value
            .map((uuid) => {
                const item = spaceItems.find((s) => s.uuid === uuid);
                return item?.path;
            })
            .filter((path): path is string => path !== undefined);
    }, [value, spaceItems]);

    // Convert paths to UUIDs helper
    const pathsToUuids = useCallback(
        (paths: string[]): string[] => {
            return paths
                .map((path) => {
                    const item = spaceItems.find((s) => s.path === path);
                    return item?.uuid;
                })
                .filter((uuid): uuid is string => uuid !== undefined);
        },
        [spaceItems],
    );

    const tree = useTree({ multiple: true });

    // Get all descendant paths for a given node path
    const getDescendantPaths = useCallback(
        (nodePath: string): string[] => {
            return spaceItems
                .filter((item) => item.path.startsWith(`${nodePath}.`))
                .map((item) => item.path);
        },
        [spaceItems],
    );

    // Get all ancestor paths for a given node path
    const getAncestorPaths = useCallback((nodePath: string): string[] => {
        const parts = nodePath.split('.');
        const ancestors: string[] = [];
        for (let i = 1; i < parts.length; i++) {
            ancestors.push(parts.slice(0, i).join('.'));
        }
        return ancestors;
    }, []);

    // Handle node click and update parent state
    const handleNodeClick = useCallback(
        (nodeValue: string, checked: boolean) => {
            const descendants = getDescendantPaths(nodeValue);
            const pathsToToggle = [nodeValue, ...descendants];

            let newCheckedPaths: string[];
            if (checked) {
                // Unchecking: remove node, descendants, and ancestors
                const ancestors = getAncestorPaths(nodeValue);
                const pathsToRemove = [...pathsToToggle, ...ancestors];
                newCheckedPaths = checkedPaths.filter(
                    (p) => !pathsToRemove.includes(p),
                );
            } else {
                // Checking: add node and descendants
                newCheckedPaths = [
                    ...new Set([...checkedPaths, ...pathsToToggle]),
                ];
            }

            const checkedUuids = pathsToUuids(newCheckedPaths);
            onChange(checkedUuids);
        },
        [
            checkedPaths,
            onChange,
            pathsToUuids,
            getDescendantPaths,
            getAncestorPaths,
        ],
    );

    const renderTreeNode = useCallback(
        ({
            node,
            expanded,
            hasChildren,
            elementProps,
            tree: treeInstance,
        }: RenderTreeNodePayload) => {
            let checked = checkedPaths.includes(node.value);
            let indeterminate = false;

            // For parent nodes, check if descendants affect the checked/indeterminate state
            if (hasChildren) {
                const descendants = getDescendantPaths(node.value);
                if (descendants.length > 0) {
                    const checkedDescendants = descendants.filter((d) =>
                        checkedPaths.includes(d),
                    );

                    // If all descendants are checked, parent is checked
                    if (checkedDescendants.length === descendants.length) {
                        checked = true;
                        indeterminate = false;
                    }
                    // If some descendants are checked, parent is indeterminate
                    else if (checkedDescendants.length > 0) {
                        checked = false;
                        indeterminate = true;
                    }
                }
            }

            return (
                <Group gap="xs" {...elementProps}>
                    <Checkbox.Indicator
                        checked={checked}
                        indeterminate={indeterminate}
                        onClick={() => handleNodeClick(node.value, checked)}
                    />

                    <Group
                        gap={5}
                        onClick={() =>
                            hasChildren &&
                            treeInstance.toggleExpanded(node.value)
                        }
                        className={
                            hasChildren
                                ? classes.expandableGroup
                                : classes.nonExpandableGroup
                        }
                    >
                        <span>{node.label}</span>

                        {hasChildren && (
                            <MantineIcon
                                icon={IconChevronDown}
                                className={`${classes.chevron} ${
                                    expanded
                                        ? classes.chevronExpanded
                                        : classes.chevronCollapsed
                                }`}
                            />
                        )}
                    </Group>
                </Group>
            );
        },
        [checkedPaths, handleNodeClick, getDescendantPaths],
    );

    const selectedCount = value.length;
    const totalSpaces = spaceItems.length;

    return (
        <Stack gap="xs">
            <Box>
                <Group gap="xs" mb={4}>
                    <Text fz="sm" fw={500}>
                        Space access
                    </Text>
                </Group>
                <Text fz="xs" c="dimmed" mb="xs">
                    Select specific spaces to restrict access. Empty selection =
                    access to all spaces.
                </Text>

                <Paper
                    withBorder
                    p="xs"
                    onClick={() => !isLoading && setIsOpen(!isOpen)}
                    className={
                        isLoading
                            ? classes.selectTriggerDisabled
                            : classes.selectTrigger
                    }
                >
                    <Group justify="space-between">
                        <Text
                            fz="sm"
                            c={selectedCount === 0 ? 'dimmed' : undefined}
                        >
                            {isLoading
                                ? 'Loading spaces...'
                                : selectedCount === 0
                                ? 'All spaces (click to restrict)'
                                : `${selectedCount} of ${totalSpaces} space${
                                      totalSpaces !== 1 ? 's' : ''
                                  } selected`}
                        </Text>
                        <MantineIcon
                            icon={IconChevronDown}
                            size={16}
                            className={`${classes.chevron} ${
                                isOpen
                                    ? classes.chevronExpanded
                                    : classes.chevronCollapsed
                            }`}
                        />
                    </Group>
                </Paper>

                <Collapse in={isOpen && !isLoading}>
                    <Paper withBorder mt="xs" p="sm">
                        <Stack gap="sm">
                            {selectedCount > 0 && (
                                <Group justify="space-between">
                                    <Text fz="xs" c="dimmed">
                                        {selectedCount} space
                                        {selectedCount !== 1 ? 's' : ''}{' '}
                                        selected
                                    </Text>
                                    <Button
                                        variant="subtle"
                                        size="xs"
                                        leftSection={
                                            <MantineIcon
                                                icon={IconX}
                                                size={14}
                                            />
                                        }
                                        onClick={() => onChange([])}
                                    >
                                        Clear selection
                                    </Button>
                                </Group>
                            )}

                            <Box className={classes.treeContainer}>
                                {treeData.length === 0 ? (
                                    <Text
                                        fz="sm"
                                        c="dimmed"
                                        ta="center"
                                        py="md"
                                    >
                                        No spaces found
                                    </Text>
                                ) : (
                                    <Tree
                                        data={treeData}
                                        tree={tree}
                                        levelOffset={rem(23)}
                                        expandOnClick={false}
                                        renderNode={renderTreeNode}
                                    />
                                )}
                            </Box>
                        </Stack>
                    </Paper>
                </Collapse>
            </Box>
        </Stack>
    );
};
