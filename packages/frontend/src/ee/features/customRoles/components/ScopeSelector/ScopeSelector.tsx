import {
    Accordion,
    Badge,
    Box,
    Button,
    Checkbox,
    Group,
    Paper,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';

import { type UseFormReturnType } from '@mantine/form';
import MantineIcon from '../../../../../components/common/MantineIcon';
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

const ScopeGroup: FC<{
    group: GroupedScopes;
    form: UseFormReturnType<RoleFormValues>;
}> = ({ group, form }) => {
    const selectedScopes = Object.entries(form.values.scopes || {})
        .filter(([_, isSelected]) => isSelected)
        .map(([scope]) => scope);

    const numSelectedInGroup = group.scopes.filter((scope) =>
        selectedScopes.includes(scope.name),
    ).length;

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
        <Accordion.Item p="sm" value={group.groupName}>
            <Accordion.Control className={styles.stickyGroupHeader}>
                <Group position="apart">
                    <Group spacing="xs">
                        <Title order={6}>{group.groupName}</Title>
                        <Badge
                            variant="light"
                            size="sm"
                            color={
                                numSelectedInGroup === 0 ? 'gray' : undefined
                            }
                        >
                            {numSelectedInGroup} / {group.scopes.length}
                        </Badge>
                    </Group>
                    <Group spacing="xs">
                        <Text size="sm">
                            {isFullySelected ? 'Deselect all' : 'Select all'}
                        </Text>
                        <Checkbox
                            checked={isFullySelected}
                            indeterminate={isPartiallySelected}
                            onChange={handleGroupToggle}
                            onClick={(e) => e.stopPropagation()}
                        />
                    </Group>
                </Group>
            </Accordion.Control>
            <Accordion.Panel>
                <Paper withBorder>
                    <Stack spacing={0}>
                        {group.scopes.map((scope) => (
                            <Box
                                key={scope.name}
                                p="sm"
                                className={styles.scopeItem}
                            >
                                <Group spacing="xs" align="flex-start">
                                    <Checkbox
                                        mt={2}
                                        {...form.getInputProps(
                                            `scopes.${scope.name}`,
                                            { type: 'checkbox' },
                                        )}
                                    />
                                    <Box className={styles.scopeContent}>
                                        <Text weight={500} size="sm">
                                            {formatScopeName(scope.name)}
                                        </Text>
                                        <Text
                                            size="xs"
                                            color="dimmed"
                                            mt={4}
                                            className={styles.scopeDescription}
                                        >
                                            {scope.description}
                                        </Text>
                                    </Box>
                                </Group>
                            </Box>
                        ))}
                    </Stack>
                </Paper>
            </Accordion.Panel>
        </Accordion.Item>
    );
};

export const ScopeSelector: FC<ScopeSelectorProps> = ({ form }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm] = useDebouncedValue(searchTerm, 300);

    const filteredScopes = useMemo(
        () => filterScopes(ALL_GROUPED_SCOPES, debouncedSearchTerm),
        [debouncedSearchTerm],
    );

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

    return (
        <Stack spacing="0">
            <div className={styles.stickyHeader}>
                <SimpleGrid cols={2}>
                    <Stack spacing="0">
                        <Title order={5}>Permissions</Title>
                        <Text
                            mb="md"
                            color={form.errors.scopes ? 'red' : 'default'}
                        >
                            Select at least one scope for this role
                        </Text>
                    </Stack>
                    <TextInput
                        my="lg"
                        pr="md"
                        placeholder="Search scopes by name or group..."
                        icon={<MantineIcon icon={IconSearch} size="sm" />}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </SimpleGrid>
                <Group position="apart">
                    <Text size="sm" color="dimmed">
                        {selectedCount} of {totalScopes} scopes selected
                    </Text>
                    <Group spacing="xs">
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
            </div>

            {filteredScopes.length === 0 ? (
                <Paper p="xl">
                    <Text align="center">
                        No scopes found matching your search.
                    </Text>
                </Paper>
            ) : (
                <Accordion
                    chevronPosition="left"
                    multiple
                    defaultValue={[filteredScopes[0].groupName]}
                >
                    {filteredScopes.map((group) => (
                        <ScopeGroup
                            key={group.group}
                            group={group}
                            form={form}
                        />
                    ))}
                </Accordion>
            )}
        </Stack>
    );
};
