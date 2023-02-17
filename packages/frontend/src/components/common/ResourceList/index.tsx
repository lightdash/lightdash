import { assertUnreachable } from '@lightdash/common';
import React, { useCallback, useState } from 'react';
import ResourceActionHandlers, {
    ResourceListAction,
    ResourceListActionState,
} from './ResourceActionHandlers';
import ResourceGrid from './ResourceGrid';
import { ResourceEmptyStateWrapper } from './ResourceList.styles';
import ResourceListWrapper, {
    ResourceListWrapperProps,
} from './ResourceListWrapper';
import ResourceTable, { ResourceTableCommonProps } from './ResourceTable';
import { ResourceListItem } from './ResourceTypeUtils';

export interface ResourceListCommonProps {
    headerTitle?: string;
    headerIcon?: JSX.Element;
    headerIconTooltipContent?: string;
    headerAction?: React.ReactNode;
    items: ResourceListItem[];
    showCount?: boolean;
    renderEmptyState?: () => React.ReactNode;
    view?: ResourceViewType;
}

export enum ResourceViewType {
    LIST = 'list',
    GRID = 'grid',
}

type ResourceListProps = ResourceListCommonProps &
    ResourceTableCommonProps &
    ResourceListWrapperProps;

const ResourceList: React.FC<ResourceListProps> = ({
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
    const [action, setAction] = useState<ResourceListActionState>({
        type: ResourceListAction.CLOSE,
    });

    const handleAction = useCallback((newAction: ResourceListActionState) => {
        setAction(newAction);
    }, []);

    return (
        <>
            <ResourceListWrapper
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
                    <ResourceGrid items={items} onAction={handleAction} />
                ) : (
                    assertUnreachable(view, 'Unknown resource view type')
                )}
            </ResourceListWrapper>

            <ResourceActionHandlers action={action} onAction={handleAction} />
        </>
    );
};

export default ResourceList;
