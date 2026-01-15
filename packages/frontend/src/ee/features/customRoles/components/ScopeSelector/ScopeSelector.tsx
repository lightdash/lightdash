import {
    Badge,
    Box,
    Button,
    Checkbox,
    Divider,
    Flex,
    Group,
    Paper,
    ScrollArea,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine-8/core';
import { type UseFormReturnType } from '@mantine/form';
import { useDebouncedValue } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { PolymorphicGroupButton } from '../../../../../components/common/PolymorphicGroupButton';
import {
    filterScopes,
    formatScopeName,
    getScopesByGroup,
    isGroupFullySelected,
    isGroupPartiallySelected,
    toggleGroupScopes,
    type GroupedScopes,
} from '../../utils/scopeUtils';
import { type RoleFormValues } from '../types';
import styles from './ScopeSelector.module.css';

type ScopeSelectorProps = {
    form: UseFormReturnType<RoleFormValues>;
};

const ALL_GROUPED_SCOPES = getScopesByGroup(true);

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
    const selectedScopes = Object.entries(form.values.scopes || {})
        .filter(([_, isSelected]) => isSelected)
        .map(([scope]) => scope);

    const isFullySelected = isGroupFullySelected(group.scopes, selectedScopes);
    const isPartiallySelected = isGroupPartiallySelected(
        group.scopes,
        selectedScopes,
    );

    const handleGroupToggle = () => {
        const newScopesArray = toggleGroupScopes(
            group.scopes,
            selectedScopes,
            !isFullySelected,
        );

        const toggledScopes = { ...form.values.scopes };

        group.scopes.forEach((scope) => {
            toggledScopes[scope.name] = false;
        });

        newScopesArray.forEach((scopeName) => {
            toggledScopes[scopeName] = true;
        });

        form.setFieldValue('scopes', toggledScopes);
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
                    {group.scopes.map((scope) => (
                        <Box
                            key={scope.name}
                            p="xs"
                            className={styles.scopeItem}
                        >
                            <Group gap="xs" align="flex-start">
                                <Checkbox
                                    mt={2}
                                    {...form.getInputProps(
                                        `scopes.${scope.name}`,
                                        { type: 'checkbox' },
                                    )}
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
                                </Stack>
                            </Group>
                        </Box>
                    ))}
                </Stack>
            </ScrollArea.Autosize>
        </Stack>
    );
};

export const ScopeSelector: FC<ScopeSelectorProps> = ({ form }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm] = useDebouncedValue(searchTerm, 300);
    const [selectedGroup, setSelectedGroup] = useState<GroupedScopes | null>(
        null,
    );

    const filteredScopes = useMemo(
        () => filterScopes(ALL_GROUPED_SCOPES, debouncedSearchTerm),
        [debouncedSearchTerm],
    );

    const effectiveSelectedGroup = useMemo(() => {
        // If user has selected a group and it's still in filtered results, use it
        if (
            selectedGroup &&
            filteredScopes.find((g) => g.group === selectedGroup.group)
        ) {
            return selectedGroup;
        }
        // Otherwise, use the first available group (or null if none)
        return filteredScopes[0] || null;
    }, [selectedGroup, filteredScopes]);

    const totalScopes = ALL_GROUPED_SCOPES.reduce(
        (acc, group) => acc + group.scopes.length,
        0,
    );

    const selectedCount = Object.values(form.values.scopes || {}).filter(
        (isSelected) => isSelected,
    ).length;

    const handleClickClearScopes = () => {
        const clearedScopes = Object.keys(form.values.scopes || {}).reduce(
            (acc, scope) => ({
                ...acc,
                [scope]: false,
            }),
            {},
        );
        form.setFieldValue('scopes', clearedScopes);
    };

    const handleClickSelectAllScopes = () => {
        const allScopesObject = ALL_GROUPED_SCOPES.flatMap(
            (group) => group.scopes,
        ).reduce(
            (acc, scope) => ({
                ...acc,
                [scope.name]: true,
            }),
            {},
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
                            Select at least one scope for this role
                        </Text>
                    </Stack>

                    <TextInput
                        placeholder="Search scopes by name or group..."
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
                        {selectedCount} of {totalScopes} scopes selected
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
                        No scopes found matching your search.
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
                                                    setSelectedGroup(group)
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
                                    Select a group to view its scopes
                                </Text>
                            )}
                        </Flex>
                    </Flex>
                </Paper>
            )}
        </Stack>
    );
};
