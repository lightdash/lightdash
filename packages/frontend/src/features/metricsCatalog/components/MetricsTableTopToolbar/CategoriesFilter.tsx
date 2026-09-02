import {
    CatalogCategoryFilterMode,
    UNCATEGORIZED_TAG_UUID,
    type CatalogField,
} from '@lightdash/common';
import { Group, SegmentedControl, Text } from '@mantine/core';
import { IconTag } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import FilterFacet, {
    type FilterFacetOption,
} from '../../../../components/common/FilterFacet';
import { useAppSelector } from '../../../sqlRunner/store/hooks';
import { useProjectTags } from '../../hooks/useProjectTags';
import { CatalogCategory } from '../CatalogCategory';

type CategoriesFilterProps = {
    selectedCategories: CatalogField['categories'][number]['tagUuid'][];
    setSelectedCategories: (
        categories: CatalogField['categories'][number]['tagUuid'][],
    ) => void;
    categoryFilterMode: CatalogCategoryFilterMode;
    setCategoryFilterMode: (mode: CatalogCategoryFilterMode) => void;
};

const UNCATEGORIZED_OPTION: FilterFacetOption = {
    value: UNCATEGORIZED_TAG_UUID,
    label: (
        <Text fz="xs" fw={500}>
            Uncategorized
        </Text>
    ),
};

const CategoriesFilter: FC<CategoriesFilterProps> = ({
    selectedCategories,
    setSelectedCategories,
    categoryFilterMode,
    setCategoryFilterMode,
}) => {
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const [searchValue, setSearchValue] = useState('');

    const { data: categories, isLoading } = useProjectTags(projectUuid);

    const options = useMemo<FilterFacetOption[]>(() => {
        if (!categories || categories.length === 0) return [];
        const search = searchValue.trim().toLowerCase();
        const categoryOptions = categories
            .filter(
                (category) =>
                    !search || category.name.toLowerCase().includes(search),
            )
            .map((category) => ({
                value: category.tagUuid,
                label: <CatalogCategory category={category} />,
                searchLabel: category.name,
            }));
        return search
            ? categoryOptions
            : [...categoryOptions, UNCATEGORIZED_OPTION];
    }, [categories, searchValue]);

    const showFilterMode =
        selectedCategories.length > 1 &&
        !selectedCategories.includes(UNCATEGORIZED_TAG_UUID);

    return (
        <FilterFacet
            label="Categories"
            icon={IconTag}
            options={options}
            selected={selectedCategories}
            onChange={setSelectedCategories}
            tooltipLabel="Filter metrics by category"
            loading={isLoading}
            clearable
            emptyLabel={
                searchValue
                    ? 'No categories match your search.'
                    : 'No categories added yet. Click on the category cells to assign categories to your metrics.'
            }
            searchValue={searchValue}
            onSearchChange={
                (categories?.length ?? 0) > 5 ? setSearchValue : undefined
            }
            searchPlaceholder="Search categories..."
            headerSection={
                showFilterMode ? (
                    <Group justify="space-between" wrap="nowrap">
                        <Text fz="xs" c="dimmed">
                            Match
                        </Text>
                        <SegmentedControl
                            size="xs"
                            value={categoryFilterMode}
                            onChange={(value) =>
                                setCategoryFilterMode(
                                    value as CatalogCategoryFilterMode,
                                )
                            }
                            data={[
                                {
                                    label: 'Any',
                                    value: CatalogCategoryFilterMode.OR,
                                },
                                {
                                    label: 'All',
                                    value: CatalogCategoryFilterMode.AND,
                                },
                            ]}
                        />
                    </Group>
                ) : undefined
            }
        />
    );
};

export default CategoriesFilter;
