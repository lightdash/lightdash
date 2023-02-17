import { assertUnreachable } from '@lightdash/common';
import React, { useCallback, useState } from 'react';
import ResourceActionHandlers, {
    ResourceViewItemAction,
    ResourceViewItemActionState,
} from './ResourceActionHandlers';
import ResourceTable, { ResourceTableCommonProps } from './ResourceTable';
import { ResourceViewItem } from './ResourceTypeUtils';
import { ResourceEmptyStateWrapper } from './ResourceView.styles';
import ResourceViewGrid from './ResourceViewGrid';
import ResourceViewWrapper, {
    ResourceViewWrapperProps,
} from './ResourceViewWrapper';

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

type ResourceViewProps = ResourceViewCommonProps &
    ResourceTableCommonProps &
    ResourceViewWrapperProps;

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
            <ResourceViewWrapper
                headerTitle={headerTitle}
                headerIcon={headerIcon}
                headerIconTooltipContent={headerIconTooltipContent}
                headerAction={headerAction}
                resourceCount={items.length}
                showCount={showCount}
            >
                {items.length === 0 ? (
                    !!renderEmptyState ? (
                        <ResourceEmptyStateWrapper>
                            {renderEmptyState()}
                        </ResourceEmptyStateWrapper>
                    ) : null
                ) : view === ResourceViewType.LIST ? (
                    <ResourceTable
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
            </ResourceViewWrapper>

            <ResourceActionHandlers action={action} onAction={handleAction} />
        </>
    );
};

export default ResourceView;
