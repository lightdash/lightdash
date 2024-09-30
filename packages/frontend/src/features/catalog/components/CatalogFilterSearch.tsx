import { CatalogFilter } from '@lightdash/common';
import {
    Divider,
    Group,
    Popover,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconBookmark, IconChevronDown } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = {
    filter: CatalogFilter | undefined;
    setFilter: (filter: CatalogFilter | undefined) => void;
};

export const CatalogFilterSearch: FC<Props> = ({ filter, setFilter }) => {
    const [isPopoverOpen, { open: openPopover, close: closePopover }] =
        useDisclosure();
    const filterLabels = useMemo(
        () => [
            {
                label: 'All item types',
                type: undefined,
            },
            {
                label: 'Tables',
                type: CatalogFilter.Tables,
            },
            {
                label: 'Metrics',
                type: CatalogFilter.Metrics,
            },
            {
                label: 'Dimensions',
                type: CatalogFilter.Dimensions,
            },
        ],
        [],
    );
    const activeFilterLabel = useMemo(
        () =>
            filterLabels.find((l) => l.type === filter && !!filter)?.label ??
            'All',
        [filter, filterLabels],
    );

    return (
        <Popover
            radius="md"
            shadow="sm"
            opened={isPopoverOpen}
            offset={{
                mainAxis: 0,
                crossAxis: 16,
            }}
        >
            <Popover.Target>
                <UnstyledButton
                    h={36}
                    px="xs"
                    fz="sm"
                    sx={(theme) => ({
                        border: `1px solid ${theme.colors.gray[3]}`,
                        borderRight: 'none',
                        borderTopLeftRadius: theme.radius.md,
                        borderBottomLeftRadius: theme.radius.md,
                        backgroundColor: theme.fn.lighten(
                            theme.colors.gray[1],
                            0.8,
                        ),
                    })}
                    onClick={openPopover}
                    onBlurCapture={closePopover}
                >
                    <Group spacing="two">
                        <Text c={filter ? 'gray.8' : 'gray.6'} fw={450}>
                            {activeFilterLabel}
                        </Text>
                        <MantineIcon color="gray.6" icon={IconChevronDown} />
                    </Group>
                </UnstyledButton>
            </Popover.Target>
            <Popover.Dropdown p={0}>
                <Stack spacing="xs">
                    <Text p="xs" pb={0} fw={400} c="gray.6" fz={11}>
                        Search by:{' '}
                    </Text>
                    <Divider color="gray.2" />
                </Stack>

                <Stack spacing={0}>
                    {filterLabels.map(({ type, label }) => (
                        <UnstyledButton
                            key={type}
                            fz="sm"
                            fw={450}
                            p="sm"
                            py="xs"
                            onClick={() => {
                                setFilter(type);
                                closePopover();
                            }}
                            sx={(theme) => ({
                                '&:hover': {
                                    backgroundColor: theme.colors.gray[1],
                                },
                            })}
                        >
                            <Group spacing="two">
                                <MantineIcon
                                    color="gray.6"
                                    icon={IconBookmark}
                                />
                                <Text c="gray.7">{label}</Text>
                            </Group>
                        </UnstyledButton>
                    ))}
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};
