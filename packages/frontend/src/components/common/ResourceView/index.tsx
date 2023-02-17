import { Tooltip2 } from '@blueprintjs/popover2';
import { assertUnreachable } from '@lightdash/common';
import React, { useCallback, useState } from 'react';
import ResourceActionHandlers, {
    ResourceViewItemAction,
    ResourceViewItemActionState,
} from './ResourceActionHandlers';
import { ResourceViewItem } from './resourceTypeUtils';
import {
    ResourceEmptyStateWrapper,
    ResourceTag,
    ResourceTitle,
    ResourceViewContainer,
    ResourceViewHeader,
    ResourceViewSpacer,
} from './ResourceView.styles';
import ResourceViewGrid from './ResourceViewGrid';
import ResourceViewList, {
    ResourceViewListCommonProps,
} from './ResourceViewList';

export interface ResourceViewCommonProps {
    headerTitle?: string;
    headerIcon?: JSX.Element;
    headerIconTooltipContent?: string;
    headerAction?: React.ReactNode;
    items: ResourceViewItem[];
    showCount?: boolean;
    renderEmptyState?: () => React.ReactNode;
    view?: ResourceViewType;
}

export enum ResourceViewType {
    LIST = 'list',
    GRID = 'grid',
}

type ResourceViewProps = ResourceViewCommonProps & ResourceViewListCommonProps;

const ResourceView: React.FC<ResourceViewProps> = ({
    view = ResourceViewType.LIST,
    items,
    headerTitle,
    headerIcon,
    headerIconTooltipContent,
    headerAction,
    enableSorting,
    enableMultiSort,
    defaultColumnVisibility,
    defaultSort,
    showCount = true,
    renderEmptyState,
}) => {
    const [action, setAction] = useState<ResourceViewItemActionState>({
        type: ResourceViewItemAction.CLOSE,
    });

    const handleAction = useCallback(
        (newAction: ResourceViewItemActionState) => {
            setAction(newAction);
        },
        [],
    );

    return (
        <>
            <ResourceViewContainer>
                {headerTitle || headerAction ? (
                    <ResourceViewHeader>
                        {headerTitle && (
                            <ResourceTitle>{headerTitle}</ResourceTitle>
                        )}
                        {headerIcon && (
                            <Tooltip2
                                content={headerIconTooltipContent || ''}
                                disabled={!headerIconTooltipContent}
                            >
                                {headerIcon}
                            </Tooltip2>
                        )}
                        {showCount && items.length > 0 && (
                            <ResourceTag round>{items.length}</ResourceTag>
                        )}

                        <ResourceViewSpacer />

                        {headerAction}
                    </ResourceViewHeader>
                ) : null}

                {items.length === 0 ? (
                    !!renderEmptyState ? (
                        <ResourceEmptyStateWrapper>
                            {renderEmptyState()}
                        </ResourceEmptyStateWrapper>
                    ) : null
                ) : view === ResourceViewType.LIST ? (
                    <ResourceViewList
                        items={items}
                        enableSorting={enableSorting}
                        enableMultiSort={enableMultiSort}
                        defaultColumnVisibility={defaultColumnVisibility}
                        defaultSort={defaultSort}
                        onAction={handleAction}
                    />
                ) : view === ResourceViewType.GRID ? (
                    <ResourceViewGrid items={items} onAction={handleAction} />
                ) : (
                    assertUnreachable(view, 'Unknown resource view type')
                )}
            </ResourceViewContainer>

            <ResourceActionHandlers action={action} onAction={handleAction} />
        </>
    );
};

export default ResourceView;
