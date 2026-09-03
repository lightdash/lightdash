import { assertUnreachable, type AiPromptContextItem } from '@lightdash/common';
import { type FC, type MouseEvent } from 'react';
import { dataAppHref } from '../../../../../features/apps/utils/appUrls';
import { elementRefChipLabel } from '../../../../../features/apps/utils/elementRefs';
import { selectDataAppPreview, setPreview } from '../../store/aiArtifactSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import { ContentReferenceLink } from '../ChatElements/ContentReferenceLink';
import { getDataAppContextItemLabel } from '../ChatElements/contentReferenceUtils';
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

const isPlainLeftClick = (e: MouseEvent<HTMLAnchorElement>) =>
    !e.defaultPrevented &&
    e.button === 0 &&
    !e.metaKey &&
    !e.altKey &&
    !e.ctrlKey &&
    !e.shiftKey;

const PinnedDataAppCard: FC<{
    item: Extract<AiPromptContextItem, { type: 'data_app' }>;
    projectUuid: string;
    previewScope: PinnedContextPreviewScope | null;
}> = ({ item, projectUuid, previewScope }) => {
    const dispatch = useAiAgentStoreDispatch();
    const currentPreview = useAiAgentStoreSelector(selectDataAppPreview);
    const isActive =
        currentPreview !== null && currentPreview.appUuid === item.appUuid;

    // Plain click opens the in-thread preview; modified clicks fall through
    // to the anchor and open the full page in a new tab.
    const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
        if (!previewScope || !isPlainLeftClick(e)) return;
        e.preventDefault();
        dispatch(
            setPreview({
                type: 'dataApp',
                appUuid: item.appUuid,
                messageUuid: previewScope.messageUuid,
                threadUuid: previewScope.threadUuid,
                projectUuid,
                agentUuid: previewScope.agentUuid,
            }),
        );
    };

    return (
        <ContentReferenceLink
            kind="data_app"
            rel="noreferrer"
            to={dataAppHref(projectUuid, item.appUuid)}
            target="_blank"
            onClick={handleClick}
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
        default:
            return assertUnreachable(item, 'Unknown AiPromptContextItem type');
    }
};
