import { type CatalogField } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Popover,
    Stack,
    Text,
    TextInput,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { IconPlus, IconRefresh, IconTrash } from '@tabler/icons-react';
import { memo, useEffect, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { useCreateTag, useProjectTags } from '../hooks/useCatalogTags';
import { getRandomColor } from '../utils/getRandomTagColor';
import { CatalogTag } from './CatalogTag';

type Props = {
    metricTags: CatalogField['catalogTags'];
    hovered: boolean;
    leftAligned?: boolean;
};

export const MetricsCatalogTagForm: FC<Props> = memo(
    ({ metricTags, hovered, leftAligned }) => {
        const { colors } = useMantineTheme();
        const projectUuid = useAppSelector(
            (state) => state.metricsCatalog.projectUuid,
        );
        const [opened, setOpened] = useState(false);
        const [search, setSearch] = useState('');
        const [tagColor, setTagColor] = useState<string>();

        const { data: tags } = useProjectTags(projectUuid);
        const createTagMutation = useCreateTag();

        useEffect(
            function generateNewColorOnPopoverOpen() {
                if (opened) {
                    setTagColor(getRandomColor(colors));
                } else {
                    setSearch('');
                    setTagColor(undefined);
                }
            },
            [opened, colors],
        );

        const handleAddTag = async (tagName: string) => {
            if (!projectUuid) return;

            try {
                const existingTag = tags?.find((tag) => tag.name === tagName);

                if (existingTag) {
                    // TODO: implement tag update
                } else {
                    await createTagMutation.mutateAsync({
                        projectUuid,
                        data: {
                            name: tagName,
                            color: tagColor ?? getRandomColor(colors),
                        },
                    });

                    // TODO: After creating tag, tag field with the uuid from the previous mutation
                    setOpened(false);
                }
                setSearch('');
                setTagColor(undefined);
            } catch (error) {
                // TODO: show toast error
                console.error('Error adding tag:', error);
            }
        };

        return (
            <Popover
                opened={opened}
                onChange={setOpened}
                position="bottom"
                width={300}
                withArrow
                shadow="md"
                withinPortal
            >
                <Popover.Target>
                    <Button
                        variant="default"
                        size="xs"
                        compact
                        pos="absolute"
                        leftIcon={
                            <MantineIcon
                                color="gray.6"
                                size={8}
                                icon={IconPlus}
                            />
                        }
                        styles={(theme) => ({
                            leftIcon: {
                                marginRight: 4,
                            },
                            root: {
                                border: `dashed 1px ${theme.colors.gray[4]}`,
                                visibility:
                                    hovered || opened ? 'visible' : 'hidden',
                                fontSize: '10px',
                                ...(leftAligned
                                    ? {
                                          left: 0,
                                          right: 'auto',
                                          top: '50%',
                                          transform: 'translateY(-50%)',
                                          bottom: 'auto',
                                      }
                                    : {
                                          right: 0,
                                          left: 'auto',
                                          bottom: 0,
                                      }),
                            },
                        })}
                        onClick={() => setOpened((prev) => !prev)}
                    >
                        Add
                    </Button>
                </Popover.Target>
                <Popover.Dropdown p="xs">
                    <TextInput
                        radius="md"
                        size="xs"
                        placeholder="Search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <Text size="xs" fw={500} color="dimmed">
                        Select a tag or create a new one
                    </Text>
                    <Stack spacing="xs" align="flex-start">
                        <Stack
                            spacing={4}
                            w="100%"
                            mah={140}
                            // For the scrollbar to not overlap the button
                            pr="sm"
                            sx={{
                                overflow: 'auto',
                            }}
                        >
                            {tags
                                ?.filter((tag) =>
                                    tag.name
                                        .toLowerCase()
                                        .includes(search.toLowerCase()),
                                )
                                .filter(
                                    (tag) =>
                                        !metricTags.some(
                                            (mt) => mt.tagUuid === tag.tagUuid,
                                        ),
                                )
                                .map((tag) => (
                                    <Group
                                        key={tag.tagUuid}
                                        spacing={4}
                                        position="apart"
                                    >
                                        <CatalogTag
                                            tag={tag}
                                            // TODO: implement tag click (tagging field)
                                        />
                                        {/* Only show on hover */}
                                        <ActionIcon
                                            size="xs"
                                            variant="subtle"
                                            onClick={() => {
                                                // TODO: implement tag deletion
                                                return;
                                            }}
                                        >
                                            <MantineIcon
                                                icon={IconTrash}
                                                color="gray.6"
                                                size={14}
                                            />
                                        </ActionIcon>
                                    </Group>
                                ))}
                        </Stack>
                        {search && !tags?.some((tag) => tag.name === search) && (
                            <Button
                                variant="light"
                                color="gray"
                                size="xs"
                                w="100%"
                                onClick={() => handleAddTag(search)}
                                styles={() => ({
                                    rightIcon: {
                                        marginLeft: 'auto',
                                    },
                                })}
                                rightIcon={
                                    <Tooltip variant="xs" label="Refresh color">
                                        <MantineIcon
                                            icon={IconRefresh}
                                            color="gray.6"
                                            size={14}
                                            style={{ cursor: 'pointer' }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setTagColor(
                                                    getRandomColor(colors),
                                                );
                                            }}
                                        />
                                    </Tooltip>
                                }
                            >
                                <Group spacing={4}>
                                    <Text>Create</Text>
                                    {tagColor && (
                                        <CatalogTag
                                            tag={{
                                                name: search,
                                                color: tagColor,
                                            }}
                                        />
                                    )}
                                </Group>
                            </Button>
                        )}
                    </Stack>
                </Popover.Dropdown>
            </Popover>
        );
    },
);
