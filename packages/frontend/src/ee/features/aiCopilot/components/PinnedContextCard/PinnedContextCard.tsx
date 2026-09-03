import { assertUnreachable, type AiPromptContextItem } from '@lightdash/common';
import { type FC } from 'react';
import { elementRefChipLabel } from '../../../../../features/apps/utils/elementRefs';
import { ContentReferenceLink } from '../ChatElements/ContentReferenceLink';
import { PinnedReviewEntityCard } from './PinnedReviewEntityCard';

type Props = {
    item: AiPromptContextItem;
    projectUuid: string;
};

type ItemMeta = {
    kind:
        | 'chart'
        | 'dashboard'
        | 'thread'
        | 'file'
        | 'repository'
        | 'external_source'
        | 'data_app_element'
        | 'data_app';
    label: string;
    href: string | null;
};

const getItemMeta = (
    item: Extract<
        AiPromptContextItem,
        {
            type:
                | 'chart'
                | 'dashboard'
                | 'thread'
                | 'file'
                | 'repository'
                | 'external_source'
                | 'data_app_element'
                | 'data_app_restore';
        }
    >,
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
        case 'file':
            return { kind: 'file', label: item.path, href: null };
        case 'repository':
            return { kind: 'repository', label: item.fullName, href: null };
        case 'external_source':
            return {
                kind: 'external_source',
                label: item.displayName,
                href: null,
            };
        // The app's source is not browsable from the thread, so no link.
        case 'data_app_element':
            return {
                kind: 'data_app_element',
                label: elementRefChipLabel(item),
                href: null,
            };
        case 'data_app_restore':
            return {
                kind: 'data_app',
                label: `Restored v${item.version} of ${item.displayName ?? 'data app'}`,
                href: null,
            };
        default:
            return assertUnreachable(item, 'Unknown AiPromptContextItem type');
    }
};

export const PinnedContextCard: FC<Props> = ({ item, projectUuid }) => {
    switch (item.type) {
        case 'chart':
        case 'dashboard':
        case 'thread':
        case 'file':
        case 'repository':
        case 'external_source':
        case 'data_app_element':
        case 'data_app_restore': {
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
        }
        case 'pull_request':
        case 'proposed_change':
        case 'review_finding':
        case 'preview_environment':
            return <PinnedReviewEntityCard item={item} />;
        default:
            return assertUnreachable(item, 'Unknown AiPromptContextItem type');
    }
};
