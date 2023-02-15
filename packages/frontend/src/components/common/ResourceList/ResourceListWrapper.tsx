import { Tooltip2 } from '@blueprintjs/popover2';
import { FC } from 'react';
import {
    ResourceListContainer,
    ResourceListHeader,
    ResourceTag,
    ResourceTitle,
    Spacer,
} from './ResourceList.styles';

export interface ResourceListWrapperProps {
    headerTitle?: string;
    headerIcon?: JSX.Element;
    headerIconTooltipContent?: string;
    headerAction?: React.ReactNode;
    resourceCount?: number;
    showCount?: boolean;
}

const ResourceListWrapper: FC<ResourceListWrapperProps> = ({
    headerTitle,
    headerIcon,
    headerIconTooltipContent,
    headerAction,
    resourceCount,
    showCount = true,
    children,
}) => {
    return (
        <ResourceListContainer>
            {headerTitle || headerAction ? (
                <ResourceListHeader>
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
                    {showCount &&
                        resourceCount !== undefined &&
                        resourceCount > 0 && (
                            <ResourceTag round>{resourceCount}</ResourceTag>
                        )}

                    <Spacer />

                    {headerAction}
                </ResourceListHeader>
            ) : null}

            {children}
        </ResourceListContainer>
    );
};

export default ResourceListWrapper;
