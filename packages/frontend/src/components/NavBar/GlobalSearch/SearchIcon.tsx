import { SavedChartSearchResult } from '@lightdash/common';
import {
    Icon123,
    IconAbc,
    IconAppWindow,
    IconFolder,
    IconLayoutDashboard,
    IconTable,
} from '@tabler/icons-react';
import { FC } from 'react';
import { getChartIcon, IconBox } from '../../common/ResourceView/ResourceIcon';
import { SearchItem } from './hooks';

type SearchIconProps = {
    searchItem: SearchItem;
};

export const SearchIcon: FC<SearchIconProps> = ({ searchItem }) => {
    switch (searchItem.type) {
        case 'field':
            return (
                <IconBox
                    color="gray.7"
                    icon={
                        searchItem.typeLabel.toLowerCase() === 'dimension'
                            ? IconAbc
                            : Icon123
                    }
                />
            );
        case 'dashboard':
            return <IconBox icon={IconLayoutDashboard} color="green.8" />;
        case 'saved_chart':
            return getChartIcon(
                (searchItem.item as SavedChartSearchResult)?.chartType,
            );
        case 'space':
            return <IconBox icon={IconFolder} color="violet.8" />;
        case 'table':
            return <IconBox icon={IconTable} color="blue.8" />;
        case 'page':
            return <IconBox icon={IconAppWindow} color="gray.7" />;
    }
};
