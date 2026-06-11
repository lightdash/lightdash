import {
    assertUnreachable,
    SearchItemType,
    type OrganizationMemberProfile,
    type SearchFilters,
} from '@lightdash/common';
import { Button, Flex, Group, Menu, Select } from '@mantine-8/core';
import { DatePicker } from '@mantine/dates';
import { useDisclosure } from '@mantine/hooks';
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
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { allSearchItemTypes } from '../types/searchItem';
import { getDateFilterLabel } from '../utils/getDateFilterLabel';
import { getSearchItemLabel } from '../utils/getSearchItemLabel';
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
        variant: hasFilter ? 'outline' : 'default',
        color: hasFilter ? 'ldGray.5' : undefined,
        c: hasFilter ? 'ldGray.7' : undefined,
    } as const;
}

const OmnibarFilters: FC<Props> = ({ filters, onSearchFilterChange }) => {
    const [isDateMenuOpen, dateMenuHandlers] = useDisclosure(false);
    const [isCreatedByMenuOpen, createdByMenuHelpers] = useDisclosure(false);
    const { data: organizationUsers } = useOrganizationUsers();

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
        <Group px="md" py="sm">
            <Menu
                position="bottom-start"
                withArrow
                shadow="md"
                arrowOffset={11}
                offset={2}
            >
                <Menu.Target>
                    <Button
                        radius="lg"
                        size="compact-xs"
                        leftSection={<MantineIcon icon={IconAdjustments} />}
                        rightSection={<MantineIcon icon={IconChevronDown} />}
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
                        radius="lg"
                        size="compact-xs"
                        leftSection={<MantineIcon icon={IconCalendar} />}
                        rightSection={<MantineIcon icon={IconChevronDown} />}
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
            <Menu
                position="bottom-start"
                withArrow
                shadow="md"
                arrowOffset={11}
                offset={2}
                opened={isCreatedByMenuOpen}
                onOpen={createdByMenuHelpers.open}
                onClose={createdByMenuHelpers.close}
            >
                <Menu.Target>
                    <Button
                        radius="lg"
                        size="compact-xs"
                        leftSection={<MantineIcon icon={IconUser} />}
                        rightSection={<MantineIcon icon={IconChevronDown} />}
                        {...getFilterButtonProps(!!filters?.createdByUuid)}
                    >
                        {filters?.createdByUuid
                            ? findUserName(
                                  filters.createdByUuid,
                                  organizationUsers,
                              )
                            : 'Created by'}
                    </Button>
                </Menu.Target>

                <Menu.Dropdown>
                    <Select
                        placeholder="Select a user"
                        searchable
                        // null keeps the Select controlled; if uncontrolled, Mantine resets the search text mid-click
                        value={filters?.createdByUuid ?? null}
                        clearable
                        allowDeselect={false}
                        // keep options inside the Menu so clicking one isn't an outside click that closes it
                        comboboxProps={{ withinPortal: false }}
                        data={userOptions}
                        onChange={(value) => {
                            onSearchFilterChange({
                                ...filters,
                                createdByUuid: value || undefined,
                            });
                        }}
                        // onChange doesn't fire when re-selecting the current value
                        onOptionSubmit={() => {
                            createdByMenuHelpers.close();
                        }}
                    />
                </Menu.Dropdown>
            </Menu>

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
