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
    | 'onCancel'
    | 'liveBuild'
    | 'hasEarlier'
    | 'isFetchingEarlier'
    | 'fetchEarlier'
    | 'currentThreadNumber'
    | 'thumbnailSource'
> & {
    opened: boolean;
    onClose: () => void;
    /** Matches the host's chat column; null falls back to the default size. */
    width: number | null;
};

/**
 * The data app builder's project history: every version across threads,
 * slid over the chat. "Back to chat" and the overlay both close it; the
 * host owns what Preview and Restore do.
 */
const AppHistoryDrawer: FC<Props> = ({
    opened,
    onClose,
    width,
    ...panelProps
}) => (
    <Drawer.Root
        opened={opened}
        onClose={onClose}
        position="left"
        size={width ?? 'lg'}
        lockScroll={false}
        classNames={{ inner: classes.inner, content: classes.content }}
    >
        <Drawer.Overlay opacity={0} blur={0} />
        <Drawer.Content aria-label="Project history">
            <Drawer.Body className={classes.body}>
                <AppVersionHistoryPanel
                    {...panelProps}
                    onBack={onClose}
                    onClose={null}
                    emptyPromptLabel={null}
                    versionTime="absolute"
                />
            </Drawer.Body>
        </Drawer.Content>
    </Drawer.Root>
);

export default AppHistoryDrawer;
