import { type ComponentProps, type FC } from 'react';
import Page from '../../components/common/Page/Page';
import { FilterSidebar } from './FilterSidebar';
import { FilterSidebarProvider } from './FilterSidebarProvider';
import { ParameterOverlays } from './ParameterOverlay';
import { ParameterSidebar } from './ParameterSidebar';
import { TabCounts } from './TabCounts';
import { TileOverlays } from './TileOverlay';
import { useFilterSidebar } from './useFilterSidebar';

type Props = ComponentProps<typeof Page>;

const SIDEBAR_WIDTH = { defaultWidth: 380, minWidth: 320, maxWidth: 560 };

// The sidebar element is always passed so the page tree keeps its shape;
// only isSidebarOpen changes when a filter is opened.
const PageWithFilterSidebar: FC<Props> = (props) => {
    const { editing, isParametersOpen } = useFilterSidebar();
    return (
        <Page
            {...props}
            sidebar={
                <>
                    <FilterSidebar />
                    <ParameterSidebar />
                </>
            }
            sidebarTitle="Edit filter"
            isSidebarOpen={editing !== null || isParametersOpen}
            noSidebarPadding
            sidebarWidthProps={SIDEBAR_WIDTH}
        />
    );
};

export const FilterSidebarPage: FC<Props> = (props) => (
    <FilterSidebarProvider>
        <PageWithFilterSidebar {...props} />
        <TileOverlays />
        <ParameterOverlays />
        <TabCounts />
    </FilterSidebarProvider>
);
