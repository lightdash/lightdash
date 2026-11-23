import { Anchor, Box, Text } from '@mantine/core';
import { IconArrowRight, type Icon } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../common/MantineIcon';
import classes from './PreviewGutter.module.css';

type Props = {
    tone: 'warning' | 'info';
    icon: Icon;
    title: string;
    detail: string;
    action: { label: string; to: string; isExternal: boolean };
};

/** A one-line notice about the workspace, in the strip above the page. */
export const NoticeGutter: FC<Props> = ({
    tone,
    icon,
    title,
    detail,
    action,
}) => (
    <Box
        className={classes.gutter}
        role="status"
        aria-label={title}
        data-tone={tone}
    >
        <Box className={classes.path}>
            <MantineIcon icon={icon} size={14} className={classes.noticeIcon} />
            <Box className={classes.label}>
                <Text fz="xs" fw={600} className={classes.noticeTitle}>
                    {title}
                </Text>
                <Text c="dimmed" truncate className={classes.detail}>
                    {detail}
                </Text>
            </Box>
        </Box>
        {action.isExternal ? (
            <Anchor
                href={action.to}
                fz="xs"
                fw={500}
                className={clsx(classes.backLink, classes.noticeAction)}
            >
                {action.label}
                <MantineIcon icon={IconArrowRight} size="sm" />
            </Anchor>
        ) : (
            <Anchor
                component={Link}
                to={action.to}
                fz="xs"
                fw={500}
                className={clsx(classes.backLink, classes.noticeAction)}
            >
                {action.label}
                <MantineIcon icon={IconArrowRight} size="sm" />
            </Anchor>
        )}
    </Box>
);
