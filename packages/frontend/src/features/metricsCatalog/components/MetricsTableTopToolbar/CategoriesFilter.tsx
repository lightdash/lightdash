import { UNCATEGORIZED_TAG_UUID, type CatalogField } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Checkbox,
    Group,
    Popover,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { clsx } from '@mantine/core';
import { IconSearch, IconTag, IconX } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useAppSelector } from '../../../sqlRunner/store/hooks';
import { useProjectTags } from '../../hooks/useProjectTags';
import { CatalogCategory } from '../CatalogCategory';
import styles from './CategoriesFilter.module.css';

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
    const [searchValue, setSearchValue] = useState('');

    // Categories are just tags
    const { data: categories, isLoading } = useProjectTags(projectUuid);

    // Filter categories by search
    const filteredCategories = useMemo(() => {
        if (!categories) return [];
        if (!searchValue) return categories;
        const searchLower = searchValue.toLowerCase();
        return categories.filter((category) =>
            category.name.toLowerCase().includes(searchLower),
        );
    }, [categories, searchValue]);

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
        <Group gap={2}>
            <Popover width={300} position="bottom-start" shadow="sm">
                <Popover.Target>
                    <Tooltip
                        withinPortal
                        label="Filter metrics by category"
                        openDelay={200}
                        maw={250}
                        fz="xs"
                    >
                        <Button
                            h={32}
                            c="ldGray.7"
                            fw={500}
                            fz="sm"
                            variant="default"
                            radius="md"
                            py="xs"
                            px="sm"
                            leftSection={
                                <MantineIcon
                                    icon={IconTag}
                                    size="md"
                                    color={
                                        hasSelectedCategories
                                            ? 'indigo.5'
                                            : 'ldGray.5'
                                    }
                                />
                            }
                            loading={isLoading}
                            className={clsx(
                                styles.filterButton,
                                hasSelectedCategories &&
                                    styles.filterButtonSelected,
                            )}
                            classNames={{
                                label: styles.filterButtonLabel,
                            }}
                        >
                            {buttonLabel}
                        </Button>
                    </Tooltip>
                </Popover.Target>
                <Popover.Dropdown p="sm">
                    <Stack gap={4}>
                        <Text fz="xs" c="ldGray.6" fw={600}>
                            Filter by categories:
                        </Text>

                        {(categories?.length ?? 0) > 5 && (
                            <TextInput
                                size="xs"
                                placeholder="Search categories..."
                                value={searchValue}
                                onChange={(e) =>
                                    setSearchValue(e.currentTarget.value)
                                }
                                rightSection={
                                    searchValue ? (
                                        <ActionIcon
                                            size="xs"
                                            onClick={() => setSearchValue('')}
                                        >
                                            <MantineIcon icon={IconX} />
                                        </ActionIcon>
                                    ) : (
                                        <MantineIcon
                                            icon={IconSearch}
                                            color="ldGray.5"
                                        />
                                    )
                                }
                            />
                        )}

                        {categories?.length === 0 && (
                            <Text fz="xs" fw={500} c="ldGray.6">
                                No categories added yet. Click on the category
                                cells to assign categories to your metrics.
                            </Text>
                        )}

                        <Stack
                            gap="xs"
                            mah={300}
                            mt="xxs"
                            className={styles.scrollableList}
                        >
                            {filteredCategories.map((category) => (
                                <Checkbox
                                    key={category.tagUuid}
                                    label={
                                        <CatalogCategory category={category} />
                                    }
                                    checked={selectedCategories.includes(
                                        category.tagUuid,
                                    )}
                                    size="xs"
                                    classNames={{
                                        body: styles.checkbox,
                                        input: styles.checkboxInput,
                                    }}
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
                            {!searchValue && (categories?.length ?? 0) > 0 && (
                                <Checkbox
                                    label="Uncategorized"
                                    checked={selectedCategories.includes(
                                        UNCATEGORIZED_TAG_UUID,
                                    )}
                                    fw={500}
                                    size="xs"
                                    classNames={{
                                        body: styles.checkbox,
                                        input: styles.checkboxInput,
                                    }}
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
                            )}
                            {filteredCategories.length === 0 &&
                                (categories?.length ?? 0) > 0 && (
                                    <Text fz="xs" c="ldGray.5">
                                        No categories match your search.
                                    </Text>
                                )}
                        </Stack>
                    </Stack>
                </Popover.Dropdown>
            </Popover>
            {hasSelectedCategories && (
                <Tooltip label="Clear all category filters">
                    <ActionIcon
                        size="xs"
                        color="ldGray.5"
                        variant="subtle"
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
