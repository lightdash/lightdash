import {
    Icon123,
    IconAbc,
    IconAppWindow,
    IconChartAreaLine,
    IconFolder,
    IconLayoutDashboard,
    IconTable,
} from '@tabler/icons-react';
import { FC } from 'react';
import MantineIcon, { MantineIconProps } from '../../common/MantineIcon';
import { SearchItem } from './hooks';

type SearchIconProps = Omit<MantineIconProps, 'icon'> & {
    item: SearchItem;
};

export const SearchIcon: FC<SearchIconProps> = ({ item, ...iconProps }) => {
    switch (item.type) {
        case 'field':
            return item.typeLabel.toLowerCase() === 'dimension' ? (
                <MantineIcon icon={IconAbc} {...iconProps} />
            ) : (
                <MantineIcon icon={Icon123} {...iconProps} />
            );
        case 'dashboard':
            return <MantineIcon icon={IconLayoutDashboard} {...iconProps} />;
        case 'saved_chart':
            return <MantineIcon icon={IconChartAreaLine} {...iconProps} />;
        case 'space':
            return <MantineIcon icon={IconFolder} {...iconProps} />;
        case 'table':
            return <MantineIcon icon={IconTable} {...iconProps} />;
        case 'page':
            return <MantineIcon icon={IconAppWindow} {...iconProps} />;
    }
};
