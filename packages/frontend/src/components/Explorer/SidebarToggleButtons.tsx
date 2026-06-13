import { ActionIcon, Paper, Tooltip } from '@mantine-8/core';
import {
    IconLayoutSidebarLeftCollapse,
    IconLayoutSidebarLeftExpand,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../common/MantineIcon';

type Props = {
    onClick: () => void;
};

/** Collapses the Explore sidebar — lives in the sidebar panel header. */
export const CollapseSidebarButton: FC<Props> = ({ onClick }) => (
    <Tooltip label="Collapse sidebar" variant="xs" position="right">
        <ActionIcon
            variant="subtle"
            color="gray"
            size="lg"
            onClick={onClick}
            aria-label="Collapse sidebar"
        >
            <MantineIcon icon={IconLayoutSidebarLeftCollapse} />
        </ActionIcon>
    </Tooltip>
);

/**
 * Thin full-height gutter holding the "open sidebar" control. Shown in the
 * content area while the sidebar is collapsed (SqlRunner-style clean toggle —
 * the sidebar stays hidden until reopened, no floating/hover reveal).
 */
export const SidebarOpenGutter: FC<Props> = ({ onClick }) => (
    <Paper shadow="none" radius={0} px="xs" py="md" style={{ flexShrink: 0 }}>
        <Tooltip label="Open sidebar" variant="xs" position="right">
            <ActionIcon
                variant="subtle"
                color="gray"
                size="lg"
                onClick={onClick}
                aria-label="Open sidebar"
            >
                <MantineIcon icon={IconLayoutSidebarLeftExpand} />
            </ActionIcon>
        </Tooltip>
    </Paper>
);
