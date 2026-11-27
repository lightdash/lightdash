import { Anchor, Box, Text, Tooltip } from '@mantine/core';
import {
    IconArrowLeft,
    IconArrowRight,
    IconInfoCircle,
    type Icon,
} from '@tabler/icons-react';
import { clsx } from 'clsx';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../common/MantineIcon';
import classes from './NoticeGutter.module.css';

type NoticeAction =
    | { type: 'link'; label: string; to: string }
    | { type: 'external'; label: string; href: string }
    | {
          type: 'back';
          label: string;
          /** Shown on hover when the label alone does not say what is lost. */
          hint: string | null;
          onClick: () => void;
      };

type Props = {
    tone: 'warning' | 'info' | 'neutral';
    icon: Icon | null;
    title: string;
    /** Explains the title, behind a quiet info icon next to it. */
    hint: string | null;
    detail: string | null;
    action: NoticeAction;
};

export const NoticeActionLink: FC<{ action: NoticeAction }> = ({ action }) => {
    const className = clsx(classes.backLink, classes.noticeAction);
    switch (action.type) {
        case 'external':
            return (
                <Anchor
                    href={action.href}
                    fz="xs"
                    fw={500}
                    className={className}
                >
                    {action.label}
                    <MantineIcon icon={IconArrowRight} size="sm" />
                </Anchor>
            );
        case 'link':
            return (
                <Anchor
                    component={Link}
                    to={action.to}
                    fz="xs"
                    fw={500}
                    className={className}
                >
                    {action.label}
                    <MantineIcon icon={IconArrowRight} size="sm" />
                </Anchor>
            );
        case 'back':
            return (
                <Tooltip
                    label={action.hint}
                    disabled={action.hint === null}
                    position="bottom-end"
                >
                    <Anchor
                        component="button"
                        type="button"
                        onClick={action.onClick}
                        fz="xs"
                        fw={500}
                        className={className}
                    >
                        <MantineIcon icon={IconArrowLeft} size="sm" />
                        <Text span inherit truncate maw={200}>
                            {action.label}
                        </Text>
                    </Anchor>
                </Tooltip>
            );
    }
};

/** A one-line notice about the workspace, in the strip above the page. */
export const NoticeGutter: FC<Props> = ({
    tone,
    icon,
    title,
    hint,
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
            {icon !== null && (
                <MantineIcon
                    icon={icon}
                    size={14}
                    className={classes.noticeIcon}
                />
            )}
            <Box className={classes.label}>
                <Text fz="xs" fw={600} className={classes.noticeTitle}>
                    {title}
                </Text>
                {hint !== null && (
                    <Tooltip label={hint} position="bottom">
                        <Box
                            component="span"
                            className={classes.noticeHint}
                            aria-label={hint}
                        >
                            <MantineIcon icon={IconInfoCircle} size={14} />
                        </Box>
                    </Tooltip>
                )}
                {detail !== null && (
                    <Text c="dimmed" truncate className={classes.detail}>
                        {detail}
                    </Text>
                )}
            </Box>
        </Box>
        <NoticeActionLink action={action} />
    </Box>
);
