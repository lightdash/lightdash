import React, { useCallback, useState } from 'react';
import ResourceActionHandlers, {
    ResourceListAction,
    ResourceListActionState,
} from './ResourceActionHandlers';
import { ResourceEmptyStateWrapper } from './ResourceList.styles';
import ResourceListWrapper, {
    ResourceListWrapperProps,
} from './ResourceListWrapper';
import ResourceTable, { ResourceTableCommonProps } from './ResourceTable';
import { ResourceListItem } from './ResourceTypeUtils';

export interface ResourceListCommonProps {
    headerTitle?: string;
    headerAction?: React.ReactNode;
    items: ResourceListItem[];
    showCount?: boolean;
    renderEmptyState: () => React.ReactNode;
}

type ResourceListProps = ResourceListCommonProps &
    ResourceTableCommonProps &
    ResourceListWrapperProps;

const ResourceList: React.FC<ResourceListProps> = ({
    items,
    headerTitle,
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
                headerAction={headerAction}
                resourceCount={items.length}
                showCount={showCount}
            >
                {items.length === 0 ? (
                    <ResourceEmptyStateWrapper>
                        {renderEmptyState()}
                    </ResourceEmptyStateWrapper>
                ) : (
                    <ResourceTable
                        items={items}
                        enableSorting={enableSorting}
                        enableMultiSort={enableMultiSort}
                        defaultColumnVisibility={defaultColumnVisibility}
                        defaultSort={defaultSort}
                        onAction={handleAction}
                    />
                )}
            </ResourceListWrapper>

            <ResourceActionHandlers action={action} onAction={handleAction} />
        </>
    );
};

export default ResourceList;
