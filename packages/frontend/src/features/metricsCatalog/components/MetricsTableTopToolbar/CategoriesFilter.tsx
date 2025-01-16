import { UNCATEGORIZED_TAG_UUID, type CatalogField } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Checkbox,
    Group,
    Popover,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconTag, IconX } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useAppSelector } from '../../../sqlRunner/store/hooks';
import { useProjectTags } from '../../hooks/useProjectTags';
import { CatalogCategory } from '../CatalogCategory';

type CategoriesFilterProps = {
    selectedCategories: CatalogField['categories'][number]['tagUuid'][];
    setSelectedCategories: (
        categories: CatalogField['categories'][number]['tagUuid'][],
    ) => void;
};

const CategoriesFilter: FC<CategoriesFilterProps> = ({
    selectedCategories,
    setSelectedCategories,
}) => {
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );

    // Categories are just tags
    const { data: categories, isLoading } = useProjectTags(projectUuid);

    const hasSelectedCategories = selectedCategories.length > 0;

    const categoryNames = useMemo(() => {
        const uncategorized = selectedCategories.includes(
            UNCATEGORIZED_TAG_UUID,
        );

        return categories
            ?.filter((category) =>
                selectedCategories.includes(category.tagUuid),
            )
            .map((category) => category.name)
            .concat(uncategorized ? ['Uncategorized'] : [])
            .join(', ');
    }, [categories, selectedCategories]);

    const buttonLabel = hasSelectedCategories
        ? categoryNames
        : 'All categories';

    return (
        <Group spacing="two">
            <Popover width={300} position="bottom-start">
                <Popover.Target>
                    <Tooltip
                        withinPortal
                        variant="xs"
                        label="Filter metrics by category"
                    >
                        <Button
                            h={32}
                            c="gray.7"
                            fw={500}
                            fz="sm"
                            variant="default"
                            radius="md"
                            py="xs"
                            px="sm"
                            leftIcon={
                                <MantineIcon
                                    icon={IconTag}
                                    size="md"
                                    color={
                                        hasSelectedCategories
                                            ? 'indigo.5'
                                            : 'gray.5'
                                    }
                                />
                            }
                            loading={isLoading}
                            styles={(theme) => ({
                                root: {
                                    border: hasSelectedCategories
                                        ? `1px solid ${theme.colors.indigo[2]}`
                                        : `1px dashed ${theme.colors.gray[3]}`,
                                    backgroundColor: hasSelectedCategories
                                        ? theme.colors.indigo[0]
                                        : undefined,
                                    textOverflow: 'ellipsis',
                                    boxShadow: theme.shadows.subtle,
                                    '&:hover': {
                                        backgroundColor: theme.colors.gray[0],
                                        transition: `background-color ${theme.other.transitionDuration}ms ${theme.other.transitionTimingFunction}`,
                                    },
                                },
                                label: {
                                    height: 24,
                                },
                            })}
                        >
                            {buttonLabel}
                        </Button>
                    </Tooltip>
                </Popover.Target>
                <Popover.Dropdown p="sm">
                    <Stack spacing={4}>
                        <Text fz="xs" c="dark.3" fw={600}>
                            Filter by categories:
                        </Text>

                        {categories?.length === 0 && (
                            <Text fz="xs" fw={500} c="gray.6">
                                No categories added yet. Click on the category
                                cells to assign categories to your metrics.
                            </Text>
                        )}

                        <Stack spacing="xs">
                            {categories?.map((category) => (
                                <Checkbox
                                    key={category.tagUuid}
                                    label={
                                        <CatalogCategory category={category} />
                                    }
                                    checked={selectedCategories.includes(
                                        category.tagUuid,
                                    )}
                                    size="xs"
                                    styles={(theme) => ({
                                        body: {
                                            alignItems: 'center',
                                        },
                                        input: {
                                            borderRadius: theme.radius.sm,
                                            border: `1px solid ${theme.colors.gray[4]}`,
                                        },
                                        label: {
                                            paddingLeft: theme.spacing.xs,
                                        },
                                    })}
                                    onChange={() => {
                                        if (
                                            selectedCategories.includes(
                                                category.tagUuid,
                                            )
                                        ) {
                                            setSelectedCategories(
                                                selectedCategories.filter(
                                                    (c) =>
                                                        c !== category.tagUuid,
                                                ),
                                            );
                                        } else {
                                            setSelectedCategories([
                                                ...selectedCategories,
                                                category.tagUuid,
                                            ]);
                                        }
                                    }}
                                />
                            ))}
                            <Checkbox
                                label="Uncategorized"
                                checked={selectedCategories.includes(
                                    UNCATEGORIZED_TAG_UUID,
                                )}
                                fw={500}
                                size="xs"
                                display={
                                    categories?.length === 0 ? 'none' : 'block'
                                }
                                styles={(theme) => ({
                                    body: {
                                        alignItems: 'center',
                                    },
                                    input: {
                                        borderRadius: theme.radius.sm,
                                        border: `1px solid ${theme.colors.gray[4]}`,
                                    },
                                    label: {
                                        paddingLeft: theme.spacing.xs,
                                    },
                                })}
                                onChange={() => {
                                    if (
                                        selectedCategories.includes(
                                            UNCATEGORIZED_TAG_UUID,
                                        )
                                    ) {
                                        setSelectedCategories(
                                            selectedCategories.filter(
                                                (c) =>
                                                    c !==
                                                    UNCATEGORIZED_TAG_UUID,
                                            ),
                                        );
                                    } else {
                                        setSelectedCategories([
                                            ...selectedCategories,
                                            UNCATEGORIZED_TAG_UUID,
                                        ]);
                                    }
                                }}
                            />
                        </Stack>
                    </Stack>
                </Popover.Dropdown>
            </Popover>
            {hasSelectedCategories && (
                <Tooltip variant="xs" label="Clear all categories">
                    <ActionIcon
                        size="xs"
                        color="gray.5"
                        onClick={() => {
                            setSelectedCategories([]);
                        }}
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                </Tooltip>
            )}
        </Group>
    );
};

export default CategoriesFilter;
