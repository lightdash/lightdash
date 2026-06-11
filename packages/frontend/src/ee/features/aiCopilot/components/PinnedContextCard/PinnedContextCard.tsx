import { assertUnreachable, type AiPromptContextItem } from '@lightdash/common';
import { type FC } from 'react';
import { ContentReferenceLink } from '../ChatElements/ContentReferenceLink';

type Props = {
    item: AiPromptContextItem;
    projectUuid: string;
};

type ItemMeta = {
    kind: 'chart' | 'dashboard' | 'thread';
    label: string;
    href: string | null;
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
        // A pinned thread can live in another project, so there is no
        // reliable in-project URL to offer.
        case 'thread':
            return {
                kind: 'thread',
                label: item.displayName ?? 'Conversation',
                href: null,
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
            to={meta.href ?? undefined}
            target={meta.href ? '_blank' : undefined}
            showArrow={meta.href !== null}
        >
            {meta.label}
        </ContentReferenceLink>
    );
};
