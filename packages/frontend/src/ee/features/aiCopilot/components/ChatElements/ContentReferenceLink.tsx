import { ChartKind } from '@lightdash/common';
import { Anchor, Box, Text, type AnchorProps } from '@mantine-8/core';
import {
    IconArrowRight,
    IconBrandGithub,
    IconChartBar,
    IconFile,
    IconFlask,
    IconGitPullRequest,
    IconLayoutDashboard,
    IconMessages,
    IconPencil,
    IconSearch,
    type Icon,
} from '@tabler/icons-react';
import { type AnchorHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { getChartIcon } from '../../../../../components/common/ResourceIcon/utils';
import styles from './ContentLink.module.css';

type ContentReferenceKind =
    | 'artifact'
    | 'chart'
    | 'dashboard'
    | 'thread'
    | 'file'
    | 'repository'
    | 'pull_request'
    | 'proposed_change'
    | 'review_finding'
    | 'preview_environment';

type Props = {
    chartKind?: ChartKind;
    children: ReactNode;
    kind: ContentReferenceKind;
    showArrow?: boolean;
    to?: LinkProps['to'];
} & Omit<
    AnchorProps,
    'children' | 'classNames' | 'c' | 'component' | 'fw' | 'fz' | 'td'
> &
    Pick<
        AnchorHTMLAttributes<HTMLAnchorElement>,
        'href' | 'onClick' | 'rel' | 'target' | 'title'
    >;

const getIconMeta = ({
    chartKind,
    kind,
}: {
    chartKind?: ChartKind;
    kind: ContentReferenceKind;
}): { color: string; fill: string; icon: Icon } => {
    switch (kind) {
        case 'dashboard':
            return {
                color: 'green.7',
                fill: 'green.6',
                icon: IconLayoutDashboard,
            };
        case 'artifact':
            return {
                color: 'indigo.6',
                fill: 'indigo.1',
                icon: IconChartBar,
            };
        case 'thread':
            return {
                color: 'violet.7',
                fill: 'violet.4',
                icon: IconMessages,
            };
        case 'file':
            return {
                color: 'ldGray.7',
                fill: 'ldGray.4',
                icon: IconFile,
            };
        case 'repository':
            return {
                color: 'ldGray.7',
                fill: 'ldGray.4',
                icon: IconBrandGithub,
            };
        case 'pull_request':
            return {
                color: 'teal.7',
                fill: 'teal.4',
                icon: IconGitPullRequest,
            };
        case 'proposed_change':
            return {
                color: 'violet.7',
                fill: 'violet.4',
                icon: IconPencil,
            };
        case 'review_finding':
            return {
                color: 'orange.7',
                fill: 'orange.4',
                icon: IconSearch,
            };
        case 'preview_environment':
            return {
                color: 'cyan.7',
                fill: 'cyan.4',
                icon: IconFlask,
            };
        case 'chart':
        default:
            return {
                color: 'blue.7',
                fill: 'blue.4',
                icon: getChartIcon(chartKind ?? ChartKind.VERTICAL_BAR),
            };
    }
};

export const ContentReferenceLink = ({
    chartKind,
    children,
    kind,
    showArrow = true,
    to,
    ...props
}: Props) => {
    const { color, fill, icon } = getIconMeta({ chartKind, kind });

    const content = (
        <>
            <MantineIcon
                icon={icon}
                size={13}
                color={color}
                fill={fill}
                fillOpacity={0.2}
                stroke={1.5}
            />

            <Text fz="xs" fw={500} m={0} truncate>
                {children}
            </Text>

            {showArrow && (
                <MantineIcon
                    icon={IconArrowRight}
                    color="ldGray.6"
                    size={11}
                    stroke={1.5}
                />
            )}
        </>
    );

    const anchorProps = {
        ...props,
        fz: 'xs',
        fw: 500,
        c: 'ldGray.8',
        td: 'none',
        classNames: { root: styles.contentLink },
    };

    // With no destination, render a plain span — no link semantics, no pointer,
    // no hover — so the chip reads as a static reference, not a clickable link.
    if (!to) {
        return (
            <Box
                component="span"
                fz="xs"
                fw={500}
                c="ldGray.8"
                className={`${styles.contentLink} ${styles.static}`}
                data-content-link="true"
            >
                {content}
            </Box>
        );
    }

    return (
        <Anchor
            {...anchorProps}
            component={Link}
            data-content-link="true"
            to={to}
        >
            {content}
        </Anchor>
    );
};
