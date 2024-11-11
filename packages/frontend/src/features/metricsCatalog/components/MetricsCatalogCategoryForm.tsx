import { type CatalogField, type Tag } from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Popover,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
    useMantineTheme,
} from '@mantine/core';
import { useFocusTrap } from '@mantine/hooks';
import { IconRefresh } from '@tabler/icons-react';
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
    useAddCategoryToCatalogItem,
    useRemoveCategoryFromCatalogItem,
} from '../hooks/useCatalogCategories';
import { useCreateTag, useProjectTags } from '../hooks/useProjectTags';
import { getRandomColor } from '../utils/getRandomTagColor';
import { CatalogCategory } from './CatalogCategory';
import { MetricCatalogCategoryFormItem } from './MetricCatalogCategoryFormItem';

type Props = {
    catalogSearchUuid: string;
    metricCategories: CatalogField['categories'];
    opened: boolean;
    onClose?: () => void;
};

export const MetricsCatalogCategoryForm: FC<Props> = memo(
    ({ catalogSearchUuid, metricCategories, opened, onClose }) => {
        const { track } = useTracking();
        const { colors } = useMantineTheme();
        const projectUuid = useAppSelector(
            (state) => state.metricsCatalog.projectUuid,
        );
        const organizationUuid = useAppSelector(
            (state) => state.metricsCatalog.organizationUuid,
        );
        const [search, setSearch] = useState('');
        const [tagColor, setTagColor] = useState<string>();

        const { data: tags } = useProjectTags(projectUuid);
        const createTagMutation = useCreateTag();
        const tagCatalogItemMutation = useAddCategoryToCatalogItem();
        const untagCatalogItemMutation = useRemoveCategoryFromCatalogItem();
        const inputFocusTrapRef = useFocusTrap();

        const categoryNames = useMemo(
            () => metricCategories.map((category) => category.name),
            [metricCategories],
        );

        const handleSearchChange = useCallback((value: string) => {
            setSearch(value);
        }, []);

        useEffect(() => {
            setTagColor(getRandomColor(colors));
        }, [colors]);

        const handleAddTag = useCallback(
            async (tagName: string) => {
                if (!projectUuid) return;

                try {
                    const existingTag = tags?.find(
                        (tag) => tag.name === tagName,
                    );

                    if (existingTag) {
                        tagCatalogItemMutation.mutate({
                            projectUuid,
                            catalogSearchUuid,
                            tagUuid: existingTag.tagUuid,
                        });
                        setSearch('');
                    } else {
                        if (!tagColor) return;

                        createTagMutation.mutate({
                            projectUuid,
                            data: {
                                name: tagName,
                                color: tagColor,
                            },
                            catalogSearchUuid,
                        });

                        // Reset search and color after creating a new tag
                        setSearch('');
                        setTagColor(getRandomColor(colors));
                    }

                    track({
                        name: EventName.METRICS_CATALOG_CATEGORY_CLICKED,
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

                try {
                    untagCatalogItemMutation.mutate({
                        projectUuid,
                        catalogSearchUuid,
                        tagUuid,
                    });
                } catch (error) {
                    console.error('Error removing tag', error);
                }
            },
            [projectUuid, untagCatalogItemMutation, catalogSearchUuid],
        );

        // Filter existing categories that are already applied to this metric
        // Returns categories whose names match the search term (case insensitive)
        const filteredExistingCategories = useMemo(
            () =>
                filter(metricCategories, (category) =>
                    includes(category.name.toLowerCase(), search.toLowerCase()),
                ),
            [metricCategories, search],
        );

        // Filter available categories that can be applied to this metric
        // 1. Get categories that aren't already applied to this metric
        // 2. Filter remaining categories to match search term (case insensitive)
        const filteredAvailableCategories = useMemo(
            () =>
                filter(
                    differenceBy(tags, metricCategories, 'tagUuid'),
                    (category) =>
                        includes(
                            category.name.toLowerCase(),
                            search.toLowerCase(),
                        ),
                ),
            [tags, search, metricCategories],
        );

        const renderValueComponent = useCallback(
            ({
                value,
                onRemove,
            }: {
                value: Tag['tagUuid'];
                onRemove: (value: Tag['tagUuid']) => void;
            }) => (
                <Box mx={2}>
                    <CatalogCategory
                        category={{
                            name: value,
                            color:
                                metricCategories.find(
                                    (category) => category.name === value,
                                )?.color ?? getRandomColor(colors),
                        }}
                        onRemove={() => {
                            onRemove(value);
                            const tagUuid = metricCategories.find(
                                (category) => category.name === value,
                            )?.tagUuid;
                            if (tagUuid) {
                                void handleUntag(tagUuid);
                            }
                        }}
                    />
                </Box>
            ),
            [colors, metricCategories, handleUntag],
        );

        return (
            <Popover
                opened={opened}
                onClose={onClose}
                position="bottom"
                width={300}
                withArrow
                shadow="md"
                withinPortal
            >
                <Popover.Target>
                    <UnstyledButton w="100%" pos="absolute" />
                </Popover.Target>
                <Popover.Dropdown
                    p={0}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                >
                    <Box p="xs">
                        <TagInput
                            value={categoryNames}
                            onSearchChange={handleSearchChange}
                            searchValue={search}
                            valueComponent={renderValueComponent}
                            ref={inputFocusTrapRef}
                            placeholder="Search"
                            size="xs"
                            mb="xs"
                            radius="md"
                            addOnBlur={false}
                            onBlur={(e) => {
                                e.stopPropagation();
                            }}
                        />
                        <Text size="xs" fw={500} color="dimmed">
                            Select a category or create a new one
                        </Text>
                    </Box>
                    <Stack spacing="xs" px="xs" align="flex-start">
                        <Stack
                            spacing={4}
                            w="100%"
                            mah={140}
                            sx={{
                                overflowY: 'auto',
                            }}
                        >
                            {filteredExistingCategories.map((category) => (
                                <MetricCatalogCategoryFormItem
                                    key={category.tagUuid}
                                    category={category}
                                />
                            ))}
                            {filteredAvailableCategories?.map((category) => (
                                <MetricCatalogCategoryFormItem
                                    key={category.tagUuid}
                                    category={category}
                                    onClick={() => handleAddTag(category.name)}
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
                                        <CatalogCategory
                                            category={{
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
