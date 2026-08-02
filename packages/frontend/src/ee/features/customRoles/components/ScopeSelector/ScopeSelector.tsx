import { type RoleLevel } from '@lightdash/common';
import {
    Badge,
    Box,
    Button,
    Checkbox,
    Collapse,
    Divider,
    Flex,
    Group,
    Paper,
    ScrollArea,
    Stack,
    Text,
    TextInput,
    Title,
    UnstyledButton,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine-8/hooks';
import { type UseFormReturnType } from '@mantine/form';
import {
    IconAlertTriangleFilled,
    IconChevronDown,
    IconCircleCheckFilled,
    IconCircleXFilled,
    IconSearch,
} from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { PolymorphicGroupButton } from '../../../../../components/common/PolymorphicGroupButton';
import {
    filterScopes,
    filterScopesByDependencyStatus,
    formatScopeName,
    getScopeDependencies,
    getScopeNamesWithDependencies,
    getScopesByGroup,
    isGroupFullySelected,
    isGroupPartiallySelected,
    type DependencyStatus,
    type GroupedScopes,
} from '../../utils/scopeUtils';
import { type RoleFormValues } from '../types';
import styles from './ScopeSelector.module.css';

type ScopeSelectorProps = {
    form: UseFormReturnType<RoleFormValues>;
    level: RoleLevel;
    dependencyStatus?: DependencyStatus;
};

const getDependencyStatusIcon = (
    selectedDependencyCount: number,
    dependencyCount: number,
) => {
    if (selectedDependencyCount === dependencyCount) {
        return { icon: IconCircleCheckFilled, color: 'green' };
    }

    if (selectedDependencyCount === 0) {
        return { icon: IconCircleXFilled, color: 'red' };
    }

    return { icon: IconAlertTriangleFilled, color: 'yellow' };
};

const GroupListItem: FC<{
    group: GroupedScopes;
    isActive: boolean;
    onClick: () => void;
    selectedCount: number;
    totalCount: number;
}> = ({ group, isActive, onClick, selectedCount, totalCount }) => {
    return (
        <PolymorphicGroupButton
            onClick={onClick}
            className={styles.groupListItem}
            data-active={isActive}
            justify="space-between"
        >
            <Text fw={isActive ? 600 : 500} fz="sm">
                {group.groupName}
            </Text>
            <Badge
                variant="light"
                size="sm"
                radius="sm"
                color={selectedCount === 0 ? 'gray' : 'blue'}
            >
                {selectedCount} / {totalCount}
            </Badge>
        </PolymorphicGroupButton>
    );
};

const ScopePanel: FC<{
    group: GroupedScopes;
    form: UseFormReturnType<RoleFormValues>;
}> = ({ group, form }) => {
    const [openDependencyScopes, setOpenDependencyScopes] = useState<
        Set<string>
    >(new Set());
    const selectedScopes = Object.entries(form.values.scopes || {})
        .filter(([_, isSelected]) => isSelected)
        .map(([scope]) => scope);

    const isFullySelected = isGroupFullySelected(group.scopes, selectedScopes);
    const isPartiallySelected = isGroupPartiallySelected(
        group.scopes,
        selectedScopes,
    );

    const handleGroupToggle = () => {
        const toggledScopes = { ...form.values.scopes };
        const shouldSelectGroup = !isFullySelected;

        group.scopes.forEach((scope) => {
            toggledScopes[scope.name] = false;
        });

        if (shouldSelectGroup) {
            const groupScopesWithDependencies = group.scopes.flatMap((scope) =>
                getScopeNamesWithDependencies(scope.name),
            );

            groupScopesWithDependencies.forEach((scopeName) => {
                toggledScopes[scopeName] = true;
            });
        }

        form.setFieldValue('scopes', toggledScopes);
    };

    const toggleDependencyScope = (scopeName: string) => {
        setOpenDependencyScopes((previous) => {
            const next = new Set(previous);

            if (next.has(scopeName)) {
                next.delete(scopeName);
            } else {
                next.add(scopeName);
            }

            return next;
        });
    };

    const setScopeSelected = (scopeName: string, isSelected: boolean) => {
        form.setFieldValue('scopes', {
            ...form.values.scopes,
            [scopeName]: isSelected,
        });
    };

    const setScopeAndDependenciesSelected = (
        scopeName: string,
        isSelected: boolean,
    ) => {
        const dependencySelections = isSelected
            ? getScopeDependencies(scopeName).reduce<Record<string, boolean>>(
                  (acc, dependency) => ({
                      ...acc,
                      [dependency.name]: true,
                  }),
                  {},
              )
            : {};

        form.setFieldValue('scopes', {
            ...form.values.scopes,
            [scopeName]: isSelected,
            ...dependencySelections,
        });
    };

    return (
        <Stack gap="md" h="100%" w="100%">
            <Group justify="space-between" style={{ flexShrink: 0 }}>
                <Title order={5}>{group.groupName}</Title>
                <Group gap="xs">
                    <Text size="xs" fw={500}>
                        {isFullySelected ? 'Deselect all' : 'Select all'}
                    </Text>
                    <Checkbox
                        checked={isFullySelected}
                        indeterminate={isPartiallySelected}
                        onChange={handleGroupToggle}
                    />
                </Group>
            </Group>

            <ScrollArea.Autosize mah="100%" flex={1}>
                <Stack gap="0">
                    {group.scopes.map((scope) => {
                        const dependencies = getScopeDependencies(scope.name);
                        const selectedDependencyCount = dependencies.filter(
                            (dependency) =>
                                form.values.scopes?.[dependency.name],
                        ).length;
                        const dependencyStatus = getDependencyStatusIcon(
                            selectedDependencyCount,
                            dependencies.length,
                        );
                        const isDependencyListOpen = openDependencyScopes.has(
                            scope.name,
                        );
                        const isSelected =
                            form.values.scopes?.[scope.name] ?? false;

                        return (
                            <Box
                                key={scope.name}
                                p="xs"
                                className={styles.scopeItem}
                            >
                                <Group gap="xs" align="flex-start">
                                    <Checkbox
                                        mt={2}
                                        checked={isSelected}
                                        onChange={(event) =>
                                            setScopeAndDependenciesSelected(
                                                scope.name,
                                                event.currentTarget.checked,
                                            )
                                        }
                                    />
                                    <Stack
                                        className={styles.scopeContent}
                                        gap="two"
                                    >
                                        <Text fw={500} fz={13}>
                                            {formatScopeName(scope.name)}
                                        </Text>
                                        <Text
                                            fz="xs"
                                            c="dimmed"
                                            className={styles.scopeDescription}
                                        >
                                            {scope.description}
                                        </Text>
                                        {dependencies.length > 0 ? (
                                            <Stack gap="xs">
                                                <Group gap="xs">
                                                    <UnstyledButton
                                                        onClick={() =>
                                                            toggleDependencyScope(
                                                                scope.name,
                                                            )
                                                        }
                                                    >
                                                        <Group gap={4}>
                                                            <MantineIcon
                                                                icon={
                                                                    IconChevronDown
                                                                }
                                                                size="sm"
                                                                className={
                                                                    styles.dependencyToggleIcon
                                                                }
                                                                data-open={
                                                                    isDependencyListOpen
                                                                }
                                                            />
                                                            <Text
                                                                fz={11}
                                                                c="dimmed"
                                                                fw={500}
                                                            >
                                                                {
                                                                    selectedDependencyCount
                                                                }{' '}
                                                                /{' '}
                                                                {
                                                                    dependencies.length
                                                                }{' '}
                                                                dependencies
                                                            </Text>
                                                            {isSelected ? (
                                                                <MantineIcon
                                                                    icon={
                                                                        dependencyStatus.icon
                                                                    }
                                                                    size={11}
                                                                    color={
                                                                        dependencyStatus.color
                                                                    }
                                                                />
                                                            ) : null}
                                                        </Group>
                                                    </UnstyledButton>
                                                </Group>
                                                <Collapse
                                                    in={isDependencyListOpen}
                                                >
                                                    <Stack gap="xs">
                                                        {dependencies.map(
                                                            (dependency) => (
                                                                <Box
                                                                    key={
                                                                        dependency.name
                                                                    }
                                                                    className={
                                                                        styles.dependencyItem
                                                                    }
                                                                >
                                                                    <Group
                                                                        gap="xs"
                                                                        align="flex-start"
                                                                    >
                                                                        <Checkbox
                                                                            size="xs"
                                                                            mt={
                                                                                1
                                                                            }
                                                                            checked={
                                                                                form
                                                                                    .values
                                                                                    .scopes?.[
                                                                                    dependency
                                                                                        .name
                                                                                ] ??
                                                                                false
                                                                            }
                                                                            onChange={(
                                                                                event,
                                                                            ) =>
                                                                                setScopeSelected(
                                                                                    dependency.name,
                                                                                    event
                                                                                        .currentTarget
                                                                                        .checked,
                                                                                )
                                                                            }
                                                                        />
                                                                        <Stack
                                                                            gap={
                                                                                0
                                                                            }
                                                                            className={
                                                                                styles.dependencyContent
                                                                            }
                                                                        >
                                                                            <Text
                                                                                fz={
                                                                                    11
                                                                                }
                                                                                fw={
                                                                                    500
                                                                                }
                                                                            >
                                                                                {formatScopeName(
                                                                                    dependency.name,
                                                                                )}
                                                                            </Text>
                                                                            {dependency.description ? (
                                                                                <Text
                                                                                    fz={
                                                                                        11
                                                                                    }
                                                                                    c="dimmed"
                                                                                >
                                                                                    {
                                                                                        dependency.description
                                                                                    }
                                                                                </Text>
                                                                            ) : null}
                                                                        </Stack>
                                                                    </Group>
                                                                </Box>
                                                            ),
                                                        )}
                                                    </Stack>
                                                </Collapse>
                                            </Stack>
                                        ) : null}
                                    </Stack>
                                </Group>
                            </Box>
                        );
                    })}
                </Stack>
            </ScrollArea.Autosize>
        </Stack>
    );
};

export const ScopeSelector: FC<ScopeSelectorProps> = ({
    form,
    level,
    dependencyStatus,
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm] = useDebouncedValue(searchTerm, 300);
    // Store the selected group's key, not the object. The group objects are
    // rebuilt (with fresh scope lists) whenever `level` or the search term
    // changes, so holding the object would render a stale group's scopes.
    const [selectedGroupKey, setSelectedGroupKey] = useState<
        GroupedScopes['group'] | null
    >(null);

    const allGroupedScopes = useMemo(
        () => getScopesByGroup(true, level),
        [level],
    );

    const dependencyFilteredScopes = useMemo(
        () =>
            filterScopesByDependencyStatus(
                allGroupedScopes,
                form.values.scopes || {},
                dependencyStatus,
            ),
        [allGroupedScopes, dependencyStatus, form.values.scopes],
    );

    const filteredScopes = useMemo(
        () => filterScopes(dependencyFilteredScopes, debouncedSearchTerm),
        [dependencyFilteredScopes, debouncedSearchTerm],
    );

    const effectiveSelectedGroup = useMemo(() => {
        // Always resolve from the freshly-built groups so a level/search change
        // can't leave us rendering a stale group object. Fall back to the first
        // available group (or null if none).
        return (
            filteredScopes.find((g) => g.group === selectedGroupKey) ??
            filteredScopes[0] ??
            null
        );
    }, [selectedGroupKey, filteredScopes]);

    const totalScopes = allGroupedScopes.reduce(
        (acc, group) => acc + group.scopes.length,
        0,
    );

    const visibleScopeNames = useMemo(
        () =>
            new Set<string>(
                allGroupedScopes.flatMap((group) =>
                    group.scopes.map((scope) => scope.name),
                ),
            ),
        [allGroupedScopes],
    );

    const selectedCount = Object.entries(form.values.scopes || {}).filter(
        ([scopeName, isSelected]) =>
            isSelected && visibleScopeNames.has(scopeName),
    ).length;

    const handleClickClearScopes = () => {
        const scopesToClear = new Set<string>(
            allGroupedScopes.flatMap((group) =>
                group.scopes.map((scope) => scope.name),
            ),
        );

        const clearedScopes = Object.keys(form.values.scopes || {}).reduce(
            (acc, scope) => ({
                ...acc,
                [scope]: scopesToClear.has(scope)
                    ? false
                    : form.values.scopes[scope],
            }),
            {},
        );
        form.setFieldValue('scopes', clearedScopes);
    };

    const handleClickSelectAllScopes = () => {
        const allScopesObject = allGroupedScopes
            .flatMap((group) => group.scopes)
            .reduce(
                (acc, scope) => ({
                    ...acc,
                    [scope.name]: true,
                }),
                { ...form.values.scopes },
            );
        form.setFieldValue('scopes', allScopesObject);
    };

    const getGroupSelectedCount = (group: GroupedScopes) => {
        const selectedScopes = Object.entries(form.values.scopes || {})
            .filter(([_, isSelected]) => isSelected)
            .map(([scope]) => scope);
        return group.scopes.filter((scope) =>
            selectedScopes.includes(scope.name),
        ).length;
    };

    return (
        <Stack gap="sm" h="100%">
            <Stack gap="sm" style={{ flexShrink: 0 }}>
                <Group justify="space-between">
                    <Stack gap="two">
                        <Title order={5}>Permissions</Title>
                        <Text
                            c={form.errors.scopes ? 'red' : 'default'}
                            fz="sm"
                        >
                            Select at least one permission for this role
                        </Text>
                    </Stack>

                    <TextInput
                        placeholder="Search permissions by name or group..."
                        w={300}
                        leftSection={
                            <MantineIcon icon={IconSearch} size="sm" />
                        }
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </Group>
                <Group justify="space-between">
                    <Text fz="sm" c="dimmed">
                        {selectedCount} of {totalScopes}{' '}
                        <Text span fw={600} inherit>
                            {level}
                        </Text>{' '}
                        permissions selected
                    </Text>
                    <Group gap="xs">
                        <Button
                            variant="subtle"
                            size="xs"
                            onClick={handleClickClearScopes}
                            disabled={selectedCount === 0}
                        >
                            Clear all
                        </Button>
                        <Button
                            variant="subtle"
                            size="xs"
                            onClick={handleClickSelectAllScopes}
                            disabled={selectedCount === totalScopes}
                        >
                            Select all
                        </Button>
                    </Group>
                </Group>
            </Stack>

            {filteredScopes.length === 0 ? (
                <Paper p="xl" style={{ flexShrink: 0 }}>
                    <Text ta="center" fz="sm">
                        No permissions found matching your search.
                    </Text>
                </Paper>
            ) : (
                <Paper flex={1} display="flex" dir="column" mih={0}>
                    <Flex gap="xs" flex={1} mih={0}>
                        {/* Left Sidebar - Group List */}
                        <Flex
                            p="xs"
                            className={styles.sidebar}
                            flex={1}
                            mih={0}
                            maw={300}
                            direction="column"
                        >
                            <ScrollArea.Autosize mah="100%" flex={1}>
                                <Stack gap="xs">
                                    {filteredScopes.map((group) => {
                                        const groupSelectedCount =
                                            getGroupSelectedCount(group);
                                        return (
                                            <GroupListItem
                                                key={group.group}
                                                group={group}
                                                isActive={
                                                    effectiveSelectedGroup?.group ===
                                                    group.group
                                                }
                                                onClick={() =>
                                                    setSelectedGroupKey(
                                                        group.group,
                                                    )
                                                }
                                                selectedCount={
                                                    groupSelectedCount
                                                }
                                                totalCount={group.scopes.length}
                                            />
                                        );
                                    })}
                                </Stack>
                            </ScrollArea.Autosize>
                        </Flex>
                        <Divider orientation="vertical" />

                        {/* Right Panel - Selected Group Scopes */}
                        <Flex
                            p="xs"
                            className={styles.scopePanel}
                            flex={1}
                            mih={0}
                        >
                            {effectiveSelectedGroup ? (
                                <ScopePanel
                                    group={effectiveSelectedGroup}
                                    form={form}
                                />
                            ) : (
                                <Text ta="center" c="dimmed" fz="sm">
                                    Select a group to view its permissions
                                </Text>
                            )}
                        </Flex>
                    </Flex>
                </Paper>
            )}
        </Stack>
    );
};
