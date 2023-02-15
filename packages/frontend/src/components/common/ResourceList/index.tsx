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
    headerIcon?: JSX.Element;
    headerIconTooltipContent?: string;
    headerAction?: React.ReactNode;
    items: ResourceListItem[];
    showCount?: boolean;
    renderEmptyState?: () => React.ReactNode;
}

type ResourceListProps = ResourceListCommonProps &
    ResourceTableCommonProps &
    ResourceListWrapperProps;

const ResourceList: React.FC<ResourceListProps> = ({
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
