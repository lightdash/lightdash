import { assertUnreachable, type AiPromptContextItem } from '@lightdash/common';
import { type FC } from 'react';
import { dataAppHref } from '../../../../../features/apps/utils/appUrls';
import { elementRefChipLabel } from '../../../../../features/apps/utils/elementRefs';
import { ContentReferenceLink } from '../ChatElements/ContentReferenceLink';
import { getDataAppContextItemLabel } from '../ChatElements/contentReferenceUtils';
import { useDataAppPreviewLink } from '../ChatElements/useDataAppPreviewLink';
import { PinnedReviewEntityCard } from './PinnedReviewEntityCard';

// The sent thread message the chip belongs to; lets a data app chip open the
// in-thread preview panel. Null on pre-send surfaces (no message yet).
export type PinnedContextPreviewScope = {
    messageUuid: string;
    threadUuid: string;
    agentUuid: string;
};

type Props = {
    item: AiPromptContextItem;
    projectUuid: string;
    previewScope: PinnedContextPreviewScope | null;
};

type ItemMeta = {
    kind:
        | 'chart'
        | 'dashboard'
        | 'thread'
        | 'file'
        | 'repository'
        | 'external_source'
        | 'data_app_element';
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
                | 'data_app_element';
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
        default:
            return assertUnreachable(item, 'Unknown AiPromptContextItem type');
    }
};

const PinnedDataAppCard: FC<{
    item: Extract<AiPromptContextItem, { type: 'data_app' }>;
    projectUuid: string;
    previewScope: PinnedContextPreviewScope | null;
}> = ({ item, projectUuid, previewScope }) => {
    const { isActive, onClick } = useDataAppPreviewLink(
        item.appUuid,
        previewScope ? { ...previewScope, projectUuid } : null,
    );

    return (
        <ContentReferenceLink
            kind="data_app"
            rel="noreferrer"
            to={dataAppHref(projectUuid, item.appUuid)}
            target="_blank"
            onClick={onClick}
            data-app-active={isActive || undefined}
            showArrow
        >
            {getDataAppContextItemLabel(item)}
        </ContentReferenceLink>
    );
};

export const PinnedContextCard: FC<Props> = ({
    item,
    projectUuid,
    previewScope,
}) => {
    switch (item.type) {
        case 'chart':
        case 'dashboard':
        case 'thread':
        case 'file':
        case 'repository':
        case 'external_source':
        case 'data_app_element': {
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
        case 'data_app':
            return (
                <PinnedDataAppCard
                    item={item}
                    projectUuid={projectUuid}
                    previewScope={previewScope}
                />
            );
        case 'pull_request':
        case 'proposed_change':
        case 'review_finding':
        case 'preview_environment':
            return <PinnedReviewEntityCard item={item} />;
        // System-only: written by the thread restore, rendered as a build card.
        case 'data_app_restore':
            return null;
        default:
            return assertUnreachable(item, 'Unknown AiPromptContextItem type');
    }
};
