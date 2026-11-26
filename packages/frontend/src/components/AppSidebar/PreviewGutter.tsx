import { Box, Text, Tooltip } from '@mantine/core';
import { IconChevronRight, IconTools } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../common/MantineIcon';
import { formatExpiresIn, getExpiresInDays } from '../NavBar/previewExpiry';
import {
    useBackToUpstreamProject,
    type UpstreamProject,
} from '../NavBar/useBackToUpstreamProject';
import { NoticeActionLink } from './NoticeGutter';
import classes from './NoticeGutter.module.css';

type Props = {
    previewName: string;
    expiresAt: Date | null;
    upstreamProject: UpstreamProject | null;
    /** Collapsed, the project selector is out of sight and the gutter says what it would have. */
    isSidebarCollapsed: boolean;
};

/** The strip above the page that says this is a preview, and of which project. */
export const PreviewGutter: FC<Props> = ({
    previewName,
    expiresAt,
    upstreamProject,
    isSidebarCollapsed,
}) => {
    const handleBackToUpstream = useBackToUpstreamProject(upstreamProject);
    // A preview whose parent is gone is named by the selector itself, so
    // beside it the gutter only says what kind of project this is.
    const label =
        upstreamProject || isSidebarCollapsed ? previewName : 'Preview';

    return (
        <Box
            className={classes.gutter}
            role="status"
            aria-label="Preview project"
            data-tone="neutral"
        >
            <Box className={classes.path}>
                {upstreamProject && (
                    <Box
                        className={classes.upstream}
                        data-visible={isSidebarCollapsed}
                        aria-hidden={!isSidebarCollapsed}
                    >
                        <Box className={classes.upstreamContent}>
                            <Text fz="xs" truncate maw={200}>
                                {upstreamProject.name}
                            </Text>
                            <MantineIcon
                                icon={IconChevronRight}
                                size="sm"
                                color="dimmed"
                                className={classes.fixed}
                            />
                        </Box>
                    </Box>
                )}
                <MantineIcon
                    icon={IconTools}
                    size={14}
                    className={classes.noticeIcon}
                />
                <Box className={classes.label}>
                    <Text
                        fz="xs"
                        fw={600}
                        truncate
                        miw={0}
                        className={classes.previewName}
                    >
                        {label}
                    </Text>
                    {expiresAt && (
                        <Tooltip
                            label={new Date(expiresAt).toLocaleString(
                                undefined,
                                {
                                    dateStyle: 'medium',
                                    timeStyle: 'short',
                                },
                            )}
                        >
                            <Text c="dimmed" className={classes.expiry}>
                                {formatExpiresIn(getExpiresInDays(expiresAt))}
                            </Text>
                        </Tooltip>
                    )}
                </Box>
            </Box>
            {upstreamProject && (
                <NoticeActionLink
                    action={{
                        type: 'back',
                        label: `Back to ${upstreamProject.name}`,
                        hint: null,
                        onClick: handleBackToUpstream,
                    }}
                />
            )}
        </Box>
    );
};
