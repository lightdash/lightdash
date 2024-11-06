import { type CatalogField } from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Popover,
    Stack,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { IconPlus, IconRefresh } from '@tabler/icons-react';
import { differenceBy, filter, includes } from 'lodash';
import {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useState,
    type FC,
} from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { TagInput } from '../../../components/common/TagInput/TagInput';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import {
    useCreateTag,
    useProjectTags,
    useTagCatalogItem,
    useUntagCatalogItem,
} from '../hooks/useCatalogTags';
import { getRandomColor } from '../utils/getRandomTagColor';
import { CatalogTag } from './CatalogTag';
import { MetricCatalogTagFormItem } from './MetricCatalogTagFormItem';

type Props = {
    catalogSearchUuid: string;
    metricTags: CatalogField['catalogTags'];
    hovered: boolean;
};

export const MetricsCatalogTagForm: FC<Props> = memo(
    ({ catalogSearchUuid, metricTags, hovered }) => {
        const { track } = useTracking();
        const { colors } = useMantineTheme();
        const projectUuid = useAppSelector(
            (state) => state.metricsCatalog.projectUuid,
        );
        const organizationUuid = useAppSelector(
            (state) => state.metricsCatalog.organizationUuid,
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
                // setSearch('');
                setTagColor(undefined);
            }
        }, [opened, colors]);

        const handleAddTag = useCallback(
            async (tagName: string) => {
                if (!projectUuid) return;

                try {
                    const existingTag = tags?.find(
                        (tag) => tag.name === tagName,
                    );

                    if (existingTag) {
                        await tagCatalogItemMutation.mutateAsync({
                            projectUuid,
                            catalogSearchUuid,
                            tagUuid: existingTag.tagUuid,
                        });
                        setSearch('');
                    } else {
                        if (!tagColor) return;

                        const newTag = await createTagMutation.mutateAsync({
                            projectUuid,
                            data: {
                                name: tagName,
                                color: tagColor,
                            },
                        });

                        await tagCatalogItemMutation.mutateAsync({
                            projectUuid,
                            catalogSearchUuid,
                            tagUuid: newTag.tagUuid,
                        });
                        // Reset search and color after creating a new tag
                        setSearch('');
                        setTagColor(getRandomColor(colors));
                    }

                    track({
                        name: EventName.METRICS_CATALOG_TAG_ADDED,
                        properties: {
                            organizationId: organizationUuid,
                            projectId: projectUuid,
                            tagName,
                            isNewTag: !existingTag,
                        },
                    });
                } catch (error) {
                    // TODO: Add toast on error
                    console.error('Error adding tag:', error);
                }
            },
            [
                projectUuid,
                tags,
                track,
                organizationUuid,
                tagCatalogItemMutation,
                catalogSearchUuid,
                tagColor,
                createTagMutation,
                colors,
            ],
        );

        const handleUntag = useCallback(
            async (tagUuid: string) => {
                if (!projectUuid) return;

                await untagCatalogItemMutation.mutateAsync({
                    projectUuid,
                    catalogSearchUuid,
                    tagUuid,
                });
            },
            [projectUuid, catalogSearchUuid, untagCatalogItemMutation],
        );

        // Filter existing tags that are already applied to this metric
        // Returns tags whose names match the search term (case insensitive)
        const filteredExistingTags = useMemo(
            () =>
                filter(metricTags, (tag) =>
                    includes(tag.name.toLowerCase(), search.toLowerCase()),
                ),
            [metricTags, search],
        );

        // Filter available tags that can be applied to this metric
        // 1. Get tags that aren't already applied (using differenceBy)
        // 2. Filter remaining tags to match search term (case insensitive)
        const filteredAvailableTags = useMemo(
            () =>
                filter(differenceBy(tags, metricTags, 'tagUuid'), (tag) =>
                    includes(tag.name.toLowerCase(), search.toLowerCase()),
                ),
            [tags, search, metricTags],
        );

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
                        fz={10}
                        right={0}
                        bottom={0}
                        left="auto"
                        styles={(theme) => ({
                            leftIcon: {
                                marginRight: 4,
                            },
                            root: {
                                border: `dashed 1px ${theme.colors.gray[4]}`,
                                visibility:
                                    hovered || opened ? 'visible' : 'hidden',
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
                        onSearchChange={(value) => {
                            setSearch(value);
                        }}
                        searchValue={search}
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
                            {filteredExistingTags.map((tag) => (
                                <MetricCatalogTagFormItem
                                    key={tag.tagUuid}
                                    tag={tag}
                                />
                            ))}
                            {filteredAvailableTags?.map((tag) => (
                                <MetricCatalogTagFormItem
                                    key={tag.tagUuid}
                                    tag={tag}
                                    onTagClick={() => handleAddTag(tag.name)}
                                />
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
