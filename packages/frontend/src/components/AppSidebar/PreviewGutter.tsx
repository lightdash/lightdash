import { Anchor, Box, Text, Tooltip } from '@mantine/core';
import {
    IconArrowLeft,
    IconChevronRight,
    IconTools,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../common/MantineIcon';
import {
    useBackToUpstreamProject,
    type UpstreamProject,
} from '../NavBar/useBackToUpstreamProject';
import classes from './PreviewGutter.module.css';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const formatExpiry = (expiresAt: Date): string => {
    const days = Math.ceil(
        (new Date(expiresAt).getTime() - Date.now()) / MS_PER_DAY,
    );
    if (days <= 0) return 'Expires today';
    return days === 1 ? 'Expires in 1 day' : `Expires in ${days} days`;
};

type Props = {
    previewName: string;
    expiresAt: Date | null;
    upstreamProject: UpstreamProject | null;
};

/** The strip above the page that says this is a preview, and of which project. */
export const PreviewGutter: FC<Props> = ({
    previewName,
    expiresAt,
    upstreamProject,
}) => {
    const handleBackToUpstream = useBackToUpstreamProject(upstreamProject);

    return (
        <Box
            className={classes.gutter}
            role="status"
            aria-label="Preview project"
        >
            <Box className={classes.path}>
                {upstreamProject && (
                    <>
                        <Text fz="xs" c="dimmed" truncate miw={0}>
                            {upstreamProject.name}
                        </Text>
                        <MantineIcon
                            icon={IconChevronRight}
                            size="xs"
                            color="dimmed"
                            className={classes.fixed}
                        />
                    </>
                )}
                <MantineIcon
                    icon={IconTools}
                    size="sm"
                    className={classes.previewIcon}
                />
                <Text
                    fz="xs"
                    fw={600}
                    truncate
                    miw={0}
                    className={classes.previewName}
                >
                    {previewName}
                </Text>
                {expiresAt && (
                    <Tooltip
                        label={new Date(expiresAt).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                        })}
                    >
                        <Text c="dimmed" className={classes.expiry}>
                            {formatExpiry(expiresAt)}
                        </Text>
                    </Tooltip>
                )}
            </Box>
            {upstreamProject && (
                <Anchor
                    component="button"
                    type="button"
                    onClick={handleBackToUpstream}
                    fz="xs"
                    fw={500}
                    className={classes.backLink}
                >
                    <MantineIcon icon={IconArrowLeft} size="sm" />
                    <Text span inherit truncate maw={200}>
                        Back to {upstreamProject.name}
                    </Text>
                </Anchor>
            )}
        </Box>
    );
};
