import { assertUnreachable, type AiPromptContextItem } from '@lightdash/common';
import { Anchor, Text } from '@mantine-8/core';
import {
    IconArrowRight,
    IconLayoutDashboard,
    type Icon,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { getChartIcon } from '../../../../../components/common/ResourceIcon/utils';
import contentLinkStyles from '../ChatElements/ContentLink.module.css';

type Props = {
    item: AiPromptContextItem;
    projectUuid: string;
};

type ItemMeta = {
    icon: Icon;
    iconColor: string;
    iconFill: string;
    label: string;
    href: string;
};

const getItemMeta = (
    item: AiPromptContextItem,
    projectUuid: string,
): ItemMeta => {
    switch (item.type) {
        case 'chart':
            return {
                icon: getChartIcon(item.chartKind ?? undefined),
                iconColor: 'blue.7',
                iconFill: 'blue.4',
                label: item.displayName ?? 'Chart',
                href: `/projects/${projectUuid}/saved/${item.chartUuid}`,
            };
        case 'dashboard':
            return {
                icon: IconLayoutDashboard,
                iconColor: 'green.7',
                iconFill: 'green.6',
                label: item.displayName ?? 'Dashboard',
                href: `/projects/${projectUuid}/dashboards/${item.dashboardUuid}`,
            };
        default:
            return assertUnreachable(item, 'Unknown AiPromptContextItem type');
    }
};

export const PinnedContextCard: FC<Props> = ({ item, projectUuid }) => {
    const meta = getItemMeta(item, projectUuid);
    return (
        <Anchor
            component={Link}
            to={meta.href}
            target="_blank"
            fz="sm"
            fw={500}
            bg="ldGray.0"
            c="ldGray.7"
            td="none"
            classNames={{ root: contentLinkStyles.contentLink }}
        >
            <MantineIcon
                icon={meta.icon}
                size="md"
                color={meta.iconColor}
                fill={meta.iconFill}
                fillOpacity={0.2}
                strokeWidth={1.9}
            />
            <Text fz="sm" fw={500} m={0}>
                {meta.label}
            </Text>
            <MantineIcon
                icon={IconArrowRight}
                color="ldGray.7"
                size="sm"
                strokeWidth={2.0}
            />
        </Anchor>
    );
};
