import { type DashboardTab } from '@lightdash/common';
import { Select } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { sortDashboardTabs } from './destinationDashboardTab';

type Props = {
    tabs: DashboardTab[];
    value: string | null;
    onChange: (tabUuid: string) => void;
};

/** Picks the tab a new tile is added to; hidden when there is no choice to make. */
const DashboardTabSelect: FC<Props> = ({ tabs, value, onChange }) => {
    const options = useMemo(
        () =>
            sortDashboardTabs(tabs).map((tab) => ({
                value: tab.uuid,
                label: tab.name,
            })),
        [tabs],
    );

    if (tabs.length < 2) return null;

    return (
        <Select
            id="select-dashboard-tab"
            label="Tab"
            data={options}
            value={value}
            onChange={(tabUuid) => {
                if (tabUuid) onChange(tabUuid);
            }}
            allowDeselect={false}
            searchable
            nothingFoundMessage="No matching tabs found"
        />
    );
};

export default DashboardTabSelect;
