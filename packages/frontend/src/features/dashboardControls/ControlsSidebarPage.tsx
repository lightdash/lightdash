import { type ComponentProps, type FC } from 'react';
import Page from '../../components/common/Page/Page';
import { ControlsSidebarProvider } from './ControlsSidebarProvider';
import { FieldTilesBar } from './FieldTilesBar';
import { LinkPrompts } from './LinkPrompts';
import { TabCounts } from './TabCounts';
import { TileOverlays } from './TileOverlay';

type Props = ComponentProps<typeof Page>;

// The page as it is; the filter editor is a popover under its pill, and
// mapping adds the tile cards, tab counts and the field bar
export const ControlsSidebarPage: FC<Props> = (props) => (
    <ControlsSidebarProvider>
        <Page {...props} />
        <LinkPrompts />
        <TileOverlays />
        <TabCounts hasTabSlots />
        <FieldTilesBar />
    </ControlsSidebarProvider>
);
