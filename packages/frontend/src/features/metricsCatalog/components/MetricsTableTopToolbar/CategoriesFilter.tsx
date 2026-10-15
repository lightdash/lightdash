import {
    CatalogCategoryFilterMode,
    UNCATEGORIZED_TAG_UUID,
    type CatalogField,
} from '@lightdash/common';
import { Group, SegmentedControl, Text } from '@mantine/core';
import { IconTag } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
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

const CategoriesFilter: FC<CategoriesFilterProps> = ({
    selectedCategories,
    setSelectedCategories,
    categoryFilterMode,
    setCategoryFilterMode,
}) => {
    const { t } = useTranslation('metricsCatalog');
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
        const uncategorizedOption: FilterFacetOption = {
            value: UNCATEGORIZED_TAG_UUID,
            label: (
                <Text fz="xs" fw={500}>
                    {t('filters.categories.uncategorized')}
                </Text>
            ),
        };
        return search
            ? categoryOptions
            : [...categoryOptions, uncategorizedOption];
    }, [categories, searchValue, t]);

    const showFilterMode =
        selectedCategories.length > 1 &&
        !selectedCategories.includes(UNCATEGORIZED_TAG_UUID);

    return (
        <FilterFacet
            label={t('filters.categories.label')}
            icon={IconTag}
            // Walkthrough for view:Tags: narrowing the catalog to one
            // category is what tags are for. See scripts/scope-tours.
            triggerProps={{
                'data-tour-scope': 'view:Tags',
                'data-tour-step': '2',
                'data-tour-route': '/projects/:projectUuid/metrics',
                'data-tour-label': 'Open the Categories filter',
                'data-tour-title': 'Find metrics by category',
                'data-tour-interactive': 'true',
                'data-tour-via': '[data-tour-nav="metrics"]',
                'data-tour-then':
                    '[data-tour-anchor="category-option"][data-tour-value="Sales"]',
                'data-tour-docs':
                    'explore/metrics-catalog/curate-the-catalog.mdx#browsing-the-catalog:li3:2',
            }}
            // Each option is an anchor named by its category (the hint is
            // declared here because the name is passed, not written):
            //   data-tour-anchor="category-option" data-tour-hint="Choose {value}"
            optionAnchor="category-option"
            options={options}
            selected={selectedCategories}
            onChange={setSelectedCategories}
            tooltipLabel={t('filters.categories.tooltip')}
            loading={isLoading}
            clearable
            emptyLabel={
                searchValue
                    ? t('filters.categories.noMatch')
                    : t('filters.categories.empty')
            }
            searchValue={searchValue}
            onSearchChange={
                (categories?.length ?? 0) > 5 ? setSearchValue : undefined
            }
            searchPlaceholder={t('filters.categories.searchPlaceholder')}
            headerSection={
                showFilterMode ? (
                    <Group justify="space-between" wrap="nowrap">
                        <Text fz="xs" c="dimmed">
                            {t('filters.categories.match')}
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
                                    label: t('filters.categories.any'),
                                    value: CatalogCategoryFilterMode.OR,
                                },
                                {
                                    label: t('filters.categories.all'),
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
