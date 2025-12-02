import { type CatalogField, type Tag } from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Popover,
    Stack,
    Text,
    UnstyledButton,
    useMantineTheme,
} from '@mantine/core';
import differenceBy from 'lodash/differenceBy';
import filter from 'lodash/filter';
import includes from 'lodash/includes';
import {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useState,
    type FC,
} from 'react';
import { TagInput } from '../../../components/common/TagInput/TagInput';
import useToaster from '../../../hooks/toaster/useToaster';
import useTracking from '../../../providers/Tracking/useTracking';
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

const isCategoryDefinedInUI = (
    category: CatalogField['categories'][number] | undefined,
) => category?.yamlReference === null;

export const MetricsCatalogCategoryForm: FC<Props> = memo(
    ({ catalogSearchUuid, metricCategories, opened, onClose }) => {
        const { track } = useTracking();
        const { colors } = useMantineTheme();
        const userUuid = useAppSelector(
            (state) => state.metricsCatalog.user?.userUuid,
        );
        const projectUuid = useAppSelector(
            (state) => state.metricsCatalog.projectUuid,
        );
        const organizationUuid = useAppSelector(
            (state) => state.metricsCatalog.organizationUuid,
        );
        const { showToastError } = useToaster();

        const [search, setSearch] = useState('');
        const [tagColor, setTagColor] = useState<string>();

        const { data: tags } = useProjectTags(projectUuid);
        const createTagMutation = useCreateTag();
        const tagCatalogItemMutation = useAddCategoryToCatalogItem();
        const untagCatalogItemMutation = useRemoveCategoryFromCatalogItem();

        const categoryNames = useMemo(
            () => metricCategories.map((category) => category.name),
            [metricCategories],
        );

        const handleSearchChange = useCallback((value: string) => {
            setSearch(value);
        }, []);

        useEffect(() => {
            setTagColor(getRandomColor());
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
                        setTagColor(getRandomColor());
                    }

                    track({
                        name: EventName.METRICS_CATALOG_CATEGORY_CLICKED,
                        properties: {
                            userId: userUuid,
                            organizationId: organizationUuid,
                            projectId: projectUuid,
                            tagName,
                            isNewTag: !existingTag,
                        },
                    });
                } catch (error) {
                    showToastError({
                        title: 'Error adding category',
                        subtitle: 'Unable to add category to metric.',
                    });
                }
            },
            [
                projectUuid,
                tags,
                track,
                userUuid,
                organizationUuid,
                tagCatalogItemMutation,
                catalogSearchUuid,
                tagColor,
                createTagMutation,
                showToastError,
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
                    showToastError({
                        title: 'Error removing category',
                        subtitle: 'Unable to remove category from metric.',
                    });
                }
            },
            [
                projectUuid,
                untagCatalogItemMutation,
                catalogSearchUuid,
                showToastError,
            ],
        );

        // Filter existing categories that are already applied to this metric
        // Returns categories whose names match the search term (case insensitive)
        const filteredExistingCategories = useMemo(
            () =>
                filter(
                    metricCategories,
                    (category) =>
                        includes(
                            category.name.toLowerCase(),
                            search.toLowerCase(),
                        ) && isCategoryDefinedInUI(category),
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
                        ) && isCategoryDefinedInUI(category),
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
            }) => {
                const category = metricCategories.find((c) => c.name === value);
                const canEdit = isCategoryDefinedInUI(category);

                return (
                    <Box mx={2}>
                        <CatalogCategory
                            category={{
                                name: value,
                                color: category?.color ?? getRandomColor(),
                                yamlReference: category?.yamlReference ?? null,
                            }}
                            showYamlIcon={!canEdit}
                            {...(canEdit && {
                                onRemove: () => {
                                    onRemove(value);
                                    const tagUuid = category?.tagUuid;
                                    if (tagUuid) {
                                        void handleUntag(tagUuid);
                                    }
                                },
                            })}
                        />
                    </Box>
                );
            },
            [metricCategories, handleUntag],
        );

        const [hasOpenSubPopover, setHasOpenSubPopover] = useState(false);

        const canCreateTag = useMemo(
            () => search && !tags?.some((tag) => tag.name === search),
            [search, tags],
        );

        return (
            <Popover
                opened={opened}
                onClose={() => {
                    // Only close the main popover if no sub-popovers are open
                    if (!hasOpenSubPopover) {
                        onClose?.();
                    }
                }}
                position="top"
                width={300}
                withArrow
                withinPortal
                trapFocus={!hasOpenSubPopover}
                closeOnClickOutside={!hasOpenSubPopover} // Prevent closing when sub-popover is open
            >
                <Popover.Target>
                    <UnstyledButton w="100%" pos="absolute" />
                </Popover.Target>
                <Popover.Dropdown p={0}>
                    <Stack px="sm" pt="sm" spacing="xs">
                        <TagInput
                            value={categoryNames}
                            allowDuplicates={false}
                            onSearchChange={handleSearchChange}
                            searchValue={search}
                            valueComponent={renderValueComponent}
                            placeholder="Search"
                            size="xs"
                            mb="xs"
                            radius="md"
                            fw={500}
                            addOnBlur={false}
                            onBlur={(e) => {
                                e.stopPropagation();
                            }}
                            onChange={async (val) => {
                                if (canCreateTag) {
                                    void handleAddTag(val[val.length - 1]);
                                }
                            }}
                            styles={(theme) => ({
                                input: {
                                    paddingBottom: 4,
                                    paddingTop: 4,
                                    paddingRight: 3,
                                },
                                tagInput: {
                                    fontWeight: 500,
                                    color: theme.colors.ldDark[9],
                                },
                                tagInputContainer: {
                                    padding: `${theme.spacing.xxs}px ${theme.spacing.xs}px`,
                                },
                                wrapper: {
                                    borderRadius: theme.radius.md,
                                    backgroundColor: 'transparent',
                                    fontWeight: 500,
                                },
                                values: {
                                    rowGap: 4,
                                },
                            })}
                        />
                        <Text size="xs" fw={500} color="dimmed">
                            Select a category or create a new one
                        </Text>
                    </Stack>
                    <Stack spacing="xs" align="flex-start" px="xs" pb="sm">
                        <Stack
                            spacing={2}
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
                                    onSubPopoverChange={setHasOpenSubPopover}
                                    canEdit={category.yamlReference === null}
                                />
                            ))}
                            {filteredAvailableCategories?.map((category) => (
                                <MetricCatalogCategoryFormItem
                                    key={category.tagUuid}
                                    category={category}
                                    onClick={() => handleAddTag(category.name)}
                                    onSubPopoverChange={setHasOpenSubPopover}
                                    canEdit={category.yamlReference === null}
                                />
                            ))}
                        </Stack>
                        {canCreateTag && (
                            <Button
                                variant="light"
                                color="gray"
                                size="xs"
                                w="100%"
                                onClick={() => handleAddTag(search)}
                                fullWidth
                                styles={{
                                    inner: {
                                        justifyContent: 'flex-start',
                                    },
                                }}
                            >
                                <Group spacing={4}>
                                    <Text>Create</Text>
                                    {tagColor && (
                                        <CatalogCategory
                                            category={{
                                                name: search,
                                                color: tagColor,
                                                yamlReference: null,
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
