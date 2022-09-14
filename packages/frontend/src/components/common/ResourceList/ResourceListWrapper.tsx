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
    headerAction?: React.ReactNode;
    resourceCount?: number;
    showCount?: boolean;
}

const ResourceListWrapper: FC<ResourceListWrapperProps> = ({
    headerTitle,
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

                    {showCount && resourceCount && resourceCount > 0 && (
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
