import { Tooltip2 } from '@blueprintjs/popover2';
import { FC } from 'react';
import {
    ResourceTag,
    ResourceTitle,
    ResourceViewContainer,
    ResourceViewHeader,
    Spacer,
} from './ResourceView.styles';

export interface ResourceViewWrapperProps {
    headerTitle?: string;
    headerIcon?: JSX.Element;
    headerIconTooltipContent?: string;
    headerAction?: React.ReactNode;
    resourceCount?: number;
    showCount?: boolean;
}

const ResourceViewWrapper: FC<ResourceViewWrapperProps> = ({
    headerTitle,
    headerIcon,
    headerIconTooltipContent,
    headerAction,
    resourceCount,
    showCount = true,
    children,
}) => {
    return (
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
                    {showCount &&
                        resourceCount !== undefined &&
                        resourceCount > 0 && (
                            <ResourceTag round>{resourceCount}</ResourceTag>
                        )}

                    <Spacer />

                    {headerAction}
                </ResourceViewHeader>
            ) : null}

            {children}
        </ResourceViewContainer>
    );
};

export default ResourceViewWrapper;
