import {
    ActionIcon,
    Group,
    Indicator,
    Kbd,
    Loader,
    Menu,
    Switch,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import {
    IconCheck,
    IconFilter,
    IconRefresh,
    IconSearch,
    IconX,
} from '@tabler/icons-react';
import { useRef, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { type TableTypeFilter } from '../utils/tableRows';
import styles from './TablesToolbar.module.css';

const TYPE_FILTER_OPTIONS: {
    value: TableTypeFilter | null;
    label: string;
}[] = [
    { value: null, label: 'All types' },
    { value: 'tables', label: 'Tables only' },
    { value: 'views', label: 'Views only' },
];

type Props = {
    search: string;
    onSearchChange: (search: string) => void;
    isSearchDisabled: boolean;
    isLoading: boolean;
    typeFilter: TableTypeFilter | null;
    onTypeFilterChange: (filter: TableTypeFilter | null) => void;
    hasViews: boolean;
    groupDevSchemas: {
        value: boolean;
        onChange: (value: boolean) => void;
    } | null;
    onRefresh: () => void;
    isRefreshDisabled: boolean;
};

export const TablesToolbar: FC<Props> = ({
    search,
    onSearchChange,
    isSearchDisabled,
    isLoading,
    typeFilter,
    onTypeFilterChange,
    hasViews,
    groupDevSchemas,
    onRefresh,
    isRefreshDisabled,
}) => {
    const searchRef = useRef<HTMLInputElement>(null);
    useHotkeys([['/', () => searchRef.current?.focus()]]);

    return (
        <Group gap="xs" wrap="nowrap">
            <TextInput
                ref={searchRef}
                className={styles.search}
                size="sm"
                disabled={isSearchDisabled}
                classNames={{ section: styles.searchSection }}
                leftSection={
                    isLoading ? (
                        <Loader size="xs" />
                    ) : (
                        <MantineIcon icon={IconSearch} />
                    )
                }
                rightSectionPointerEvents="all"
                rightSection={
                    search ? (
                        <ActionIcon
                            aria-label="Clear search"
                            onMouseDown={(event) => event.preventDefault()}
                            size="xs"
                            onClick={() => onSearchChange('')}
                        >
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    ) : (
                        <Kbd size="xs">/</Kbd>
                    )
                }
                placeholder="Search tables"
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
            />

            <Menu position="bottom-end" width={220}>
                <Menu.Target>
                    <Indicator
                        disabled={typeFilter === null}
                        size={6}
                        offset={4}
                        color="ldGray.9"
                    >
                        <Tooltip label="Filter and refresh">
                            <ActionIcon
                                variant="default"
                                size="lg"
                                aria-label="Filter and refresh"
                            >
                                <MantineIcon icon={IconFilter} />
                            </ActionIcon>
                        </Tooltip>
                    </Indicator>
                </Menu.Target>
                <Menu.Dropdown>
                    {TYPE_FILTER_OPTIONS.map((option) => (
                        <Menu.Item
                            key={option.label}
                            disabled={option.value !== null && !hasViews}
                            onClick={() => onTypeFilterChange(option.value)}
                            rightSection={
                                typeFilter === option.value ? (
                                    <MantineIcon icon={IconCheck} />
                                ) : null
                            }
                        >
                            {option.label}
                        </Menu.Item>
                    ))}
                    {groupDevSchemas && (
                        <>
                            <Menu.Divider />
                            <Menu.Item
                                closeMenuOnClick={false}
                                onClick={() =>
                                    groupDevSchemas.onChange(
                                        !groupDevSchemas.value,
                                    )
                                }
                                rightSection={
                                    <Switch
                                        size="xs"
                                        checked={groupDevSchemas.value}
                                        onChange={() => {}}
                                        aria-hidden
                                        tabIndex={-1}
                                    />
                                }
                            >
                                Group dev schemas
                            </Menu.Item>
                        </>
                    )}
                    <Menu.Divider />
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconRefresh} />}
                        disabled={isRefreshDisabled}
                        onClick={onRefresh}
                    >
                        Refresh catalog
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>
        </Group>
    );
};
