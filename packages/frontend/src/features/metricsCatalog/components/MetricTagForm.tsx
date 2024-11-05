import { type CatalogField } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Popover,
    Stack,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { IconPlus, IconRefresh, IconTrash } from '@tabler/icons-react';
import { memo, useEffect, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { TagInput } from '../../../components/common/TagInput/TagInput';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import {
    useCreateTag,
    useProjectTags,
    useTagCatalogItem,
    useUntagCatalogItem,
} from '../hooks/useCatalogTags';
import { CatalogTag } from './CatalogTag';

type MetricTagFormProps = {
    catalogSearchUuid: CatalogField['catalogSearchUuid'];
    metricTags: CatalogField['catalogTags'];
    hovered: boolean;
    leftAligned?: boolean;
};

const getRandomColor = (
    mantineColors: ReturnType<typeof useMantineTheme>['colors'],
) => {
    const colors = [
        mantineColors.blue[5],
        mantineColors.blue[6],
        mantineColors.blue[7],
        mantineColors.cyan[5],
        mantineColors.cyan[6],
        mantineColors.cyan[7],
        mantineColors.teal[5],
        mantineColors.teal[6],
        mantineColors.teal[7],
        mantineColors.green[5],
        mantineColors.green[6],
        mantineColors.green[7],
        mantineColors.orange[5],
        mantineColors.orange[6],
        mantineColors.orange[7],
        mantineColors.red[5],
        mantineColors.red[6],
        mantineColors.red[7],
        mantineColors.pink[5],
        mantineColors.pink[6],
        mantineColors.pink[7],
        mantineColors.grape[5],
        mantineColors.grape[6],
        mantineColors.grape[7],
        mantineColors.violet[5],
        mantineColors.violet[6],
        mantineColors.violet[7],
        mantineColors.gray[6],
        mantineColors.gray[7],
        mantineColors.gray[8],
    ];
    return colors[Math.floor(Math.random() * colors.length)];
};

export const MetricTagForm: FC<MetricTagFormProps> = memo(
    ({ catalogSearchUuid, metricTags, hovered, leftAligned }) => {
        const { colors } = useMantineTheme();
        const projectUuid = useAppSelector(
            (state) => state.metricsCatalog.projectUuid,
        );
        const [opened, setOpened] = useState(false);
        const [search, setSearch] = useState('');
        const [tagColor, setTagColor] = useState<string>();

        const { data: tags } = useProjectTags(projectUuid);
        const createTagMutation = useCreateTag();
        const tagCatalogItemMutation = useTagCatalogItem();
        const untagCatalogItemMutation = useUntagCatalogItem();

        // Generate new color when popover opens
        useEffect(() => {
            if (opened) {
                setTagColor(getRandomColor(colors));
            } else {
                setSearch('');
                setTagColor(undefined);
            }
        }, [opened, colors]);

        const handleAddTag = async (tagName: string) => {
            if (!projectUuid) return;

            try {
                const existingTag = tags?.find((tag) => tag.name === tagName);

                if (existingTag) {
                    await tagCatalogItemMutation.mutateAsync({
                        catalogSearchUuid,
                        tagUuid: existingTag.tagUuid,
                    });
                } else {
                    const newTag = await createTagMutation.mutateAsync({
                        projectUuid,
                        data: {
                            name: tagName,
                            color: tagColor ?? getRandomColor(colors),
                        },
                    });

                    await tagCatalogItemMutation.mutateAsync({
                        catalogSearchUuid,
                        tagUuid: newTag.tagUuid,
                    });
                    setOpened(false);
                }
                setSearch('');
                setTagColor(undefined);
            } catch (error) {
                // TODO: show toast error
                console.error('Error adding tag:', error);
            }
        };

        const handleUntag = async (tagUuid: string) => {
            await untagCatalogItemMutation.mutateAsync({
                catalogSearchUuid,
                tagUuid,
            });
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
                    <TagInput
                        value={metricTags.map((tag) => tag.name)}
                        placeholder="Search"
                        size="xs"
                        mb="xs"
                        radius="md"
                        onSearchChange={(value) => setSearch(value)}
                        addOnBlur={false}
                        onBlur={(e) => {
                            e.stopPropagation();
                        }}
                        valueComponent={({ value, onRemove }) => (
                            <Box mx={2}>
                                <CatalogTag
                                    tag={{
                                        name: value,
                                        color:
                                            metricTags.find(
                                                (tag) => tag.name === value,
                                            )?.color ?? getRandomColor(colors),
                                    }}
                                    onRemove={() => {
                                        onRemove(value);
                                        const tagUuid = metricTags.find(
                                            (tag) => tag.name === value,
                                        )?.tagUuid;
                                        if (tagUuid) {
                                            void handleUntag(tagUuid);
                                        }
                                    }}
                                />
                            </Box>
                        )}
                    />
                    <Text size="xs" fw={500} color="dimmed" mb="xs">
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
                                            onTagClick={() =>
                                                handleAddTag(tag.name)
                                            }
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
