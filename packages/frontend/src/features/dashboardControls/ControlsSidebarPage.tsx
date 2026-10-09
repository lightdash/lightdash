import { type ComponentProps, type FC } from 'react';
import Page from '../../components/common/Page/Page';
import { ControlSidebar } from './ControlSidebar';
import { ControlsSidebarProvider } from './ControlsSidebarProvider';
import { FieldTilesBar } from './FieldTilesBar';
import { LinkPrompts } from './LinkPrompts';
import { TabCounts } from './TabCounts';
import { TileOverlays } from './TileOverlay';
import { useControlsSidebar } from './useControlsSidebar';
import { usePinnedSidebarTop } from './usePinnedSidebarTop';

type Props = ComponentProps<typeof Page>;

const SIDEBAR_WIDTH = { defaultWidth: 380, minWidth: 320, maxWidth: 560 };

// The sidebar element is always passed so the page tree keeps its shape;
// only isSidebarOpen changes when a control is opened.
const PageWithControlSidebar: FC<Props> = (props) => {
    const { isSidebarOpen } = useControlsSidebar();
    usePinnedSidebarTop();
    return (
        <Page
            {...props}
            sidebar={<ControlSidebar />}
            sidebarTitle="Edit filter"
            isSidebarOpen={isSidebarOpen}
            noSidebarPadding
            sidebarWidthProps={SIDEBAR_WIDTH}
        />
    );
};

export const ControlsSidebarPage: FC<Props> = (props) => (
    <ControlsSidebarProvider>
        <PageWithControlSidebar {...props} />
        <TileOverlays />
        <LinkPrompts />
        <TabCounts />
        <FieldTilesBar />
    </ControlsSidebarProvider>
);
