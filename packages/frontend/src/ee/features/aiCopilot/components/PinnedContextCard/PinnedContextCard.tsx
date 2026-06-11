import { assertUnreachable, type AiPromptContextItem } from '@lightdash/common';
import { type FC } from 'react';
import { ContentReferenceLink } from '../ChatElements/ContentReferenceLink';

type Props = {
    item: AiPromptContextItem;
    projectUuid: string;
};

type ItemMeta = {
    kind: 'chart' | 'dashboard';
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
                kind: 'chart',
                label: item.displayName ?? 'Chart',
                href: `/projects/${projectUuid}/saved/${item.chartUuid}`,
            };
        case 'dashboard':
            return {
                kind: 'dashboard',
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
        <ContentReferenceLink
            kind={meta.kind}
            rel="noreferrer"
            to={meta.href}
            target="_blank"
        >
            {meta.label}
        </ContentReferenceLink>
    );
};
