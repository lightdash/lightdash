import { FilterGroup } from 'common';
import React from 'react';
import { useExplorer } from '../providers/ExplorerProvider';
import AddFilterGroup from './filter-group/AddFilterGroup';
import FilterGroupForm from './filter-group/FilterGroupForm';

const FiltersForm = () => {
    const {
        state: { filters: activeFilters },
        actions: { setFilters: setActiveFilters },
    } = useExplorer();

    const onDeleteFilterGroup = (index: number) => {
        setActiveFilters([
            ...activeFilters.slice(0, index),
            ...activeFilters.slice(index + 1),
        ]);
    };

    const onChangeFilterGroup = (index: number, filterGroup: FilterGroup) => {
        setActiveFilters([
            ...activeFilters.slice(0, index),
            filterGroup,
            ...activeFilters.slice(index + 1),
        ]);
    };

    return (
        <div
            style={{
                paddingTop: '10px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                alignItems: 'start',
            }}
        >
            {activeFilters.map((filterGroup, idx) => (
                // eslint-disable-next-line react/no-array-index-key
                <React.Fragment key={idx}>
                    <div
                        style={{
                            paddingLeft: '15px',
                            width: '100%',
                            paddingBottom: '20px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '5px',
                        }}
                    >
                        <FilterGroupForm
                            filterGroup={filterGroup}
                            onDelete={() => onDeleteFilterGroup(idx)}
                            onChange={(changedFilterGroup) =>
                                onChangeFilterGroup(idx, changedFilterGroup)
                            }
                        />
                    </div>
                </React.Fragment>
            ))}
            <AddFilterGroup />
        </div>
    );
};

export default FiltersForm;
