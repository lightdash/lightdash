import { type ComponentProps, type FC } from 'react';
import Page from '../../components/common/Page/Page';
import { ControlsSidebarProvider } from './ControlsSidebarProvider';
import { FieldTilesBar } from './FieldTilesBar';
import { LinkPrompts } from './LinkPrompts';
import { TabCounts } from './TabCounts';
import { TileOverlays } from './TileOverlay';

type Props = ComponentProps<typeof Page>;

// The page as it is; the editor rail sits next to the grid (`ControlsRail`)
export const ControlsSidebarPage: FC<Props> = (props) => (
    <ControlsSidebarProvider>
        <Page {...props} />
        <TileOverlays />
        <LinkPrompts />
        <TabCounts />
        <FieldTilesBar />
    </ControlsSidebarProvider>
);
