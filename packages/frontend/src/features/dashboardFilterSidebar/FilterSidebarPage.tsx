import { type ComponentProps, type FC } from 'react';
import Page from '../../components/common/Page/Page';
import { FilterSidebar } from './FilterSidebar';
import { FilterSidebarProvider } from './FilterSidebarProvider';
import { useFilterSidebar } from './useFilterSidebar';

type Props = ComponentProps<typeof Page>;

const SIDEBAR_WIDTH = { defaultWidth: 380, minWidth: 320, maxWidth: 560 };

// The sidebar element is always passed so the page tree keeps its shape;
// only isSidebarOpen changes when a filter is opened.
const PageWithFilterSidebar: FC<Props> = (props) => {
    const { editing } = useFilterSidebar();
    return (
        <Page
            {...props}
            sidebar={<FilterSidebar />}
            sidebarTitle="Edit filter"
            isSidebarOpen={editing !== null}
            noSidebarPadding
            sidebarWidthProps={SIDEBAR_WIDTH}
        />
    );
};

export const FilterSidebarPage: FC<Props> = (props) => (
    <FilterSidebarProvider>
        <PageWithFilterSidebar {...props} />
    </FilterSidebarProvider>
);
