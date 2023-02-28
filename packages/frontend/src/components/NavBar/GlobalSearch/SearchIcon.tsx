import {
    Icon123,
    IconAbc,
    IconAppWindow,
    IconChartAreaLine,
    IconFolder,
    IconLayoutDashboard,
    IconTable,
} from '@tabler/icons-react';
import { CSSProperties, FC } from 'react';
import { SearchItem } from './hooks';

export const SearchIcon: FC<{
    item: SearchItem;
    color?: string | undefined;
    size?: number | undefined;
    style?: CSSProperties | undefined;
}> = ({ item, color, size, style }) => {
    switch (item.type) {
        case 'field':
            return item.typeLabel.toLowerCase() === 'dimension' ? (
                <IconAbc color={color} size={size} style={style} />
            ) : (
                <Icon123 color={color} size={size} style={style} />
            );
        case 'dashboard':
            return (
                <IconLayoutDashboard color={color} size={size} style={style} />
            );
        case 'saved_chart':
            return (
                <IconChartAreaLine color={color} size={size} style={style} />
            );
        case 'space':
            return <IconFolder color={color} size={size} style={style} />;
        case 'table':
            return <IconTable color={color} size={size} style={style} />;
        case 'page':
            return <IconAppWindow color={color} size={size} style={style} />;
    }
};
