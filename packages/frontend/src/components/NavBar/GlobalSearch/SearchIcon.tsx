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
import { MantineIconProps } from '../../common/MantineIcon';
import { getChartIcon, IconBox } from '../../common/ResourceView/ResourceIcon';
import { SearchItem } from './hooks';

type SearchIconProps = Omit<MantineIconProps, 'icon'> & {
    searchItem: SearchItem;
};

export const SearchIcon: FC<SearchIconProps> = ({
    searchItem,
    ...iconProps
}) => {
    switch (searchItem.type) {
        case 'field':
            return (
                <IconBox
                    color="black"
                    icon={
                        searchItem.typeLabel.toLowerCase() === 'dimension'
                            ? IconAbc
                            : Icon123
                    }
                    {...iconProps}
                />
            );
        case 'dashboard':
            return (
                <IconBox
                    icon={IconLayoutDashboard}
                    color="green.8"
                    {...iconProps}
                />
            );
        case 'saved_chart':
            return getChartIcon(
                (searchItem.item as SavedChartSearchResult)?.chartType,
            );
        case 'space':
            return (
                <IconBox icon={IconFolder} color="violet.8" {...iconProps} />
            );
        case 'table':
            return <IconBox icon={IconTable} color="blue.8" {...iconProps} />;
        case 'page':
            return (
                <IconBox icon={IconAppWindow} color="black" {...iconProps} />
            );
    }
};
