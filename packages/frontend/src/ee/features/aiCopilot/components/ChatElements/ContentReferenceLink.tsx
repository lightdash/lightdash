import { ChartKind } from '@lightdash/common';
import { Anchor, Text, type AnchorProps } from '@mantine-8/core';
import {
    IconArrowRight,
    IconChartBar,
    IconLayoutDashboard,
    IconMessages,
    type Icon,
} from '@tabler/icons-react';
import { type AnchorHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { getChartIcon } from '../../../../../components/common/ResourceIcon/utils';
import styles from './ContentLink.module.css';

type ContentReferenceKind = 'artifact' | 'chart' | 'dashboard' | 'thread';

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

    return to ? (
        <Anchor
            {...anchorProps}
            component={Link}
            data-content-link="true"
            to={to}
        >
            {content}
        </Anchor>
    ) : (
        <Anchor {...anchorProps} data-content-link="true">
            {content}
        </Anchor>
    );
};
