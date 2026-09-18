import { Drawer } from '@mantine/core';
import { type FC } from 'react';
import classes from './AppHistoryDrawer.module.css';
import AppVersionHistoryPanel, {
    type AppVersionHistoryPanelProps,
} from './AppVersionHistoryPanel';

type Props = Pick<
    AppVersionHistoryPanelProps,
    | 'versions'
    | 'latestReadyVersion'
    | 'viewedVersion'
    | 'onView'
    | 'onRestore'
    | 'liveBuild'
    | 'hasEarlier'
    | 'isFetchingEarlier'
    | 'fetchEarlier'
    | 'currentThreadNumber'
> & {
    opened: boolean;
    onClose: () => void;
};

/**
 * The data app builder's project history: every version across threads,
 * slid over the chat. "Back to chat" and the overlay both close it; the
 * host owns what Preview and Restore do.
 */
const AppHistoryDrawer: FC<Props> = ({ opened, onClose, ...panelProps }) => (
    <Drawer.Root
        opened={opened}
        onClose={onClose}
        position="left"
        size="lg"
        lockScroll={false}
        classNames={{ inner: classes.inner, content: classes.content }}
    >
        <Drawer.Overlay opacity={0.1} blur={0} />
        <Drawer.Content aria-label="Project history">
            <Drawer.Body className={classes.body}>
                <AppVersionHistoryPanel
                    {...panelProps}
                    onBack={onClose}
                    onClose={null}
                    emptyPromptLabel={null}
                    olderVersionTime="relative"
                />
            </Drawer.Body>
        </Drawer.Content>
    </Drawer.Root>
);

export default AppHistoryDrawer;
