import {
    assertUnreachable,
    SearchItemType,
    type OrganizationMemberProfile,
    type SearchFilters,
} from '@lightdash/common';
import { Box, Button, Flex, Group, Menu, Select } from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import { DatePicker } from '@mantine/dates';
import {
    IconAdjustments,
    IconAppWindow,
    IconBrowser,
    IconCalendar,
    IconChartBar,
    IconChevronDown,
    IconCodeCircle,
    IconFolder,
    IconLayoutDashboard,
    IconLayoutNavbarInactive,
    IconRectangle,
    IconSettings,
    IconTable,
    IconUser,
    IconX,
} from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { allSearchItemTypes } from '../types/searchItem';
import { getDateFilterLabel } from '../utils/getDateFilterLabel';
import { getSearchItemLabel } from '../utils/getSearchItemLabel';
import classes from './OmnibarFilters.module.css';
import { getOmnibarItemColor } from './utils';

const getOmnibarItemIcon = (itemType: SearchItemType) => {
    switch (itemType) {
        case SearchItemType.FIELD:
            return IconRectangle;
        case SearchItemType.DASHBOARD:
            return IconLayoutDashboard;
        case SearchItemType.DASHBOARD_TAB:
            return IconLayoutNavbarInactive;

        case SearchItemType.CHART:
            return IconChartBar;
        case SearchItemType.SPACE:
            return IconFolder;
        case SearchItemType.TABLE:
            return IconTable;
        case SearchItemType.PAGE:
            return IconBrowser;
        case SearchItemType.SQL_CHART:
            return IconCodeCircle;
        case SearchItemType.DATA_APP:
            return IconAppWindow;
        case SearchItemType.SETTINGS:
            return IconSettings;
        default:
            return assertUnreachable(
                itemType,
                `Unknown search item type: ${itemType}`,
            );
    }
};

type Props = {
    filters?: SearchFilters;
    onSearchFilterChange: (searchFilters?: SearchFilters) => void;
};

function findUserName(
    userUuid: string,
    userList: OrganizationMemberProfile[] = [],
) {
    const user = userList.find((u) => u.userUuid === userUuid);

    if (user) {
        return `${user.firstName} ${user.lastName}`;
    }
}

function getFilterButtonProps(hasFilter: boolean) {
    return {
        variant: 'subtle',
        radius: 'md',
        className: hasFilter
            ? `${classes.filterButton} ${classes.filterButtonActive}`
            : classes.filterButton,
    } as const;
}

/** An active filter swaps its caret for an × that drops just that filter,
 *  without opening the panel behind it. */
const FilterRightSection: FC<{ isActive: boolean; onClear: () => void }> = ({
    isActive,
    onClear,
}) =>
    isActive ? (
        <Box
            component="span"
            role="button"
            aria-label="Clear filter"
            className={classes.clearSection}
            onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
            onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                e.preventDefault();
                onClear();
            }}
        >
            <MantineIcon icon={IconX} strokeWidth={1.5} />
        </Box>
    ) : (
        <MantineIcon icon={IconChevronDown} strokeWidth={1.5} />
    );

const OmnibarFilters: FC<Props> = ({ filters, onSearchFilterChange }) => {
    const [isDateMenuOpen, dateMenuHandlers] = useDisclosure(false);
    const [isCreatedByExpanded, setIsCreatedByExpanded] = useState(false);
    const createdByInputRef = useRef<HTMLInputElement>(null);
    const { data: organizationUsers } = useOrganizationUsers();

    useEffect(() => {
        if (isCreatedByExpanded) {
            createdByInputRef.current?.focus();
        }
    }, [isCreatedByExpanded]);

    const canClearFilters = useMemo(() => {
        return (
            filters?.type ||
            filters?.fromDate ||
            filters?.toDate ||
            filters?.createdByUuid
        );
    }, [filters]);

    const userOptions = useMemo(
        () =>
            organizationUsers?.map((user) => ({
                value: user.userUuid,
                label: `${user.firstName} ${user.lastName}`,
            })) || [],
        [organizationUsers],
    );

    return (
        <Group
            px="xs"
            py="xxs"
            gap="two"
            align="center"
            wrap="nowrap"
            className={classes.filtersRow}
        >
            <Menu
                position="bottom-start"
                withArrow
                shadow="md"
                arrowOffset={11}
                offset={2}
            >
                <Menu.Target>
                    <Button
                        size="compact-xs"
                        leftSection={
                            filters?.type ? (
                                <MantineIcon
                                    icon={getOmnibarItemIcon(
                                        filters.type as SearchItemType,
                                    )}
                                    color={getOmnibarItemColor(
                                        filters.type as SearchItemType,
                                    )}
                                    strokeWidth={1.5}
                                />
                            ) : (
                                <MantineIcon
                                    icon={IconAdjustments}
                                    strokeWidth={1.5}
                                />
                            )
                        }
                        rightSection={
                            <FilterRightSection
                                isActive={!!filters?.type}
                                onClear={() =>
                                    onSearchFilterChange({
                                        ...filters,
                                        type: undefined,
                                    })
                                }
                            />
                        }
                        {...getFilterButtonProps(!!filters?.type)}
                    >
                        {filters?.type
                            ? getSearchItemLabel(filters.type as SearchItemType)
                            : 'Item type'}
                    </Button>
                </Menu.Target>

                <Menu.Dropdown>
                    {allSearchItemTypes.map((type) => (
                        <Menu.Item
                            key={type}
                            leftSection={
                                <MantineIcon
                                    icon={getOmnibarItemIcon(type)}
                                    color={getOmnibarItemColor(type)}
                                />
                            }
                            bg={type === filters?.type ? 'ldGray.1' : undefined}
                            onClick={() => {
                                onSearchFilterChange({
                                    ...filters,
                                    type:
                                        type === filters?.type
                                            ? undefined
                                            : type,
                                });
                            }}
                        >
                            {getSearchItemLabel(type)}
                        </Menu.Item>
                    ))}
                </Menu.Dropdown>
            </Menu>
            <Menu
                position="bottom-start"
                withArrow
                shadow="md"
                arrowOffset={11}
                offset={2}
                opened={isDateMenuOpen}
                onOpen={dateMenuHandlers.open}
                onClose={dateMenuHandlers.close}
            >
                <Menu.Target>
                    <Button
                        size="compact-xs"
                        leftSection={
                            <MantineIcon
                                icon={IconCalendar}
                                strokeWidth={1.5}
                            />
                        }
                        rightSection={
                            <FilterRightSection
                                isActive={
                                    !!filters?.fromDate || !!filters?.toDate
                                }
                                onClear={() =>
                                    onSearchFilterChange({
                                        ...filters,
                                        fromDate: undefined,
                                        toDate: undefined,
                                    })
                                }
                            />
                        }
                        {...getFilterButtonProps(
                            !!filters?.fromDate || !!filters?.toDate,
                        )}
                    >
                        {getDateFilterLabel(filters)}
                    </Button>
                </Menu.Target>
                <Menu.Dropdown>
                    <Flex direction="column" align="flex-end">
                        <DatePicker
                            type="range"
                            allowSingleDateInRange
                            maxDate={new Date()}
                            value={[
                                filters?.fromDate
                                    ? new Date(filters.fromDate)
                                    : null,
                                filters?.toDate
                                    ? new Date(filters.toDate)
                                    : null,
                            ]}
                            onChange={(value) => {
                                const [fromDate, toDate] = value;

                                onSearchFilterChange({
                                    ...filters,
                                    fromDate: fromDate?.toISOString(),
                                    toDate: toDate?.toISOString(),
                                });

                                if (fromDate && toDate) {
                                    dateMenuHandlers.close();
                                }
                            }}
                        />
                        <Button
                            variant="white"
                            size="compact-xs"
                            mt="sm"
                            onClick={() => {
                                onSearchFilterChange({
                                    ...filters,
                                    fromDate: undefined,
                                    toDate: undefined,
                                });
                            }}
                        >
                            Clear
                        </Button>
                    </Flex>
                </Menu.Dropdown>
            </Menu>
            {isCreatedByExpanded ? (
                <Select
                    ref={createdByInputRef}
                    size="xs"
                    radius="md"
                    w={200}
                    classNames={{ input: classes.createdByInput }}
                    placeholder="Search a user..."
                    searchable
                    // null keeps the Select controlled; if uncontrolled, Mantine resets the search text mid-click
                    value={filters?.createdByUuid ?? null}
                    clearable
                    allowDeselect={false}
                    data={userOptions}
                    leftSection={
                        <MantineIcon icon={IconUser} strokeWidth={1.5} />
                    }
                    onChange={(value) => {
                        onSearchFilterChange({
                            ...filters,
                            createdByUuid: value || undefined,
                        });
                    }}
                    // The × clears the input text on its own; drop the filter too
                    onClear={() =>
                        onSearchFilterChange({
                            ...filters,
                            createdByUuid: undefined,
                        })
                    }
                    // onChange doesn't fire when re-selecting the current value
                    onOptionSubmit={() => setIsCreatedByExpanded(false)}
                    // Collapsing on dropdown close would unmount this mid-click
                    // and swallow the × — only collapse once focus truly leaves
                    onBlur={() => setIsCreatedByExpanded(false)}
                />
            ) : (
                <Button
                    size="compact-xs"
                    leftSection={
                        <MantineIcon icon={IconUser} strokeWidth={1.5} />
                    }
                    rightSection={
                        <FilterRightSection
                            isActive={!!filters?.createdByUuid}
                            onClear={() =>
                                onSearchFilterChange({
                                    ...filters,
                                    createdByUuid: undefined,
                                })
                            }
                        />
                    }
                    {...getFilterButtonProps(!!filters?.createdByUuid)}
                    onClick={() => setIsCreatedByExpanded(true)}
                >
                    {filters?.createdByUuid
                        ? findUserName(filters.createdByUuid, organizationUsers)
                        : 'Created by'}
                </Button>
            )}

            {canClearFilters && (
                <Button
                    variant="subtle"
                    ml="auto"
                    radius="xl"
                    size="compact-xs"
                    leftSection={<MantineIcon icon={IconX} size="sm" />}
                    onClick={() => {
                        onSearchFilterChange({});
                    }}
                >
                    Clear filters
                </Button>
            )}
        </Group>
    );
};

export default OmnibarFilters;
