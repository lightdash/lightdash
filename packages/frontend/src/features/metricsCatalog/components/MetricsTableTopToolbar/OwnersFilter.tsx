import { UNASSIGNED_OWNER, type CatalogOwner } from '@lightdash/common';
import { Text } from '@mantine/core';
import { IconUser } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
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

const UNASSIGNED_OPTION: FilterFacetOption = {
    value: UNASSIGNED_OWNER,
    label: (
        <Text fz="xs" fw={500}>
            Unassigned
        </Text>
    ),
};

const OwnersFilter: FC<OwnersFilterProps> = ({
    selectedOwners,
    setSelectedOwners,
}) => {
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
        return search ? ownerOptions : [...ownerOptions, UNASSIGNED_OPTION];
    }, [owners, searchValue]);

    return (
        <FilterFacet
            label="Owners"
            icon={IconUser}
            options={options}
            selected={selectedOwners}
            onChange={setSelectedOwners}
            tooltipLabel="Filter metrics by owner"
            loading={isLoading}
            clearable
            emptyLabel={
                searchValue
                    ? 'No owners match your search.'
                    : 'No owners configured yet. Add spotlight.owner in your metric or model YAML to assign owners.'
            }
            searchValue={searchValue}
            onSearchChange={
                (owners?.length ?? 0) > 5 ? setSearchValue : undefined
            }
            searchPlaceholder="Search owners..."
        />
    );
};

export default OwnersFilter;
