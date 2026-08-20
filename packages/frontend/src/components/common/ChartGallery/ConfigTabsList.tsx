import { Tabs, type TabsListProps } from '@mantine/core';
import { type FC } from 'react';
import OverflowTabsList from '../OverflowTabsList/OverflowTabsList';
import { useIsInsideChartGallery } from './ChartGalleryContext';

// The gallery sidebar is narrow, so its tab strips scroll instead of wrapping.
const ConfigTabsList: FC<TabsListProps> = ({ children, ...props }) => {
    const isInsideChartGallery = useIsInsideChartGallery();

    return isInsideChartGallery ? (
        <OverflowTabsList {...props}>{children}</OverflowTabsList>
    ) : (
        <Tabs.List {...props}>{children}</Tabs.List>
    );
};

export default ConfigTabsList;
