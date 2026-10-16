import { UNASSIGNED_OWNER, type CatalogOwner } from '@lightdash/common';
import { Text } from '@mantine/core';
import { IconUser } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import FilterFacet, {
    type FilterFacetOption,
} from '../../../../components/common/FilterFacet';
import { useAppSelector } from '../../../sqlRunner/store/hooks';
import { useMetricOwners } from '../../hooks/useMetricOwners';

type OwnersFilterProps = {
    selectedOwners: string[];
    setSelectedOwners: (owners: string[]) => void;
};

const getOwnerDisplayName = (owner: CatalogOwner) =>
    `${owner.firstName} ${owner.lastName}`;

const OwnersFilter: FC<OwnersFilterProps> = ({
    selectedOwners,
    setSelectedOwners,
}) => {
    const { t } = useTranslation('metricsCatalog');
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const [searchValue, setSearchValue] = useState('');

    const { data: owners, isLoading } = useMetricOwners({ projectUuid });

    const options = useMemo<FilterFacetOption[]>(() => {
        if (!owners || owners.length === 0) return [];
        const search = searchValue.trim().toLowerCase();
        const ownerOptions = owners
            .filter(
                (owner) =>
                    !search ||
                    getOwnerDisplayName(owner).toLowerCase().includes(search) ||
                    owner.email.toLowerCase().includes(search),
            )
            .map((owner) => ({
                value: owner.userUuid,
                label: getOwnerDisplayName(owner),
            }));
        const unassignedOption: FilterFacetOption = {
            value: UNASSIGNED_OWNER,
            label: (
                <Text fz="xs" fw={500}>
                    {t('filters.owners.unassigned')}
                </Text>
            ),
        };
        return search ? ownerOptions : [...ownerOptions, unassignedOption];
    }, [owners, searchValue, t]);

    return (
        <FilterFacet
            label={t('filters.owners.label')}
            icon={IconUser}
            options={options}
            selected={selectedOwners}
            onChange={setSelectedOwners}
            tooltipLabel={t('filters.owners.tooltip')}
            loading={isLoading}
            clearable
            emptyLabel={
                searchValue
                    ? t('filters.owners.noMatch')
                    : t('filters.owners.empty')
            }
            searchValue={searchValue}
            onSearchChange={
                (owners?.length ?? 0) > 5 ? setSearchValue : undefined
            }
            searchPlaceholder={t('filters.owners.searchPlaceholder')}
        />
    );
};

export default OwnersFilter;
