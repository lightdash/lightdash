import { Button, CardProps, CollapseProps } from '@blueprintjs/core';
import { FC, useCallback } from 'react';
import {
    StyledCard,
    StyledCardActionsWrpper,
    StyledCardHeader,
    StyledCardTitle,
    StyledCardTitleWrapper,
    StyledCollapse,
} from './CollapsableCard.style';

type CollapsableCardProps = {
    headerActions?: React.ReactNode;
    isExpanded?: boolean;
    onToggle?: (isOpen: boolean) => void;
} & Pick<CollapseProps, 'children' | 'isOpen'> &
    Pick<CardProps, 'title'>;

export const CollapsableCard: FC<CollapsableCardProps> = ({
    title,
    children,
    headerActions,
    onToggle,
    isOpen,
    isExpanded = false,
}) => {
    const handleToggle = useCallback(
        (value: boolean) => onToggle?.(value),
        [onToggle],
    );

    return (
        <StyledCard elevation={1}>
            <StyledCardHeader>
                <StyledCardTitleWrapper>
                    <Button
                        minimal
                        icon={isOpen ? 'chevron-down' : 'chevron-right'}
                        onClick={() => handleToggle(!isOpen)}
                    />
                    <StyledCardTitle>{title}</StyledCardTitle>
                </StyledCardTitleWrapper>

                {isOpen && (
                    <StyledCardActionsWrpper>
                        {headerActions}
                    </StyledCardActionsWrpper>
                )}
            </StyledCardHeader>

            <StyledCollapse isOpen={isOpen} $isExpanded={isExpanded}>
                {children}
            </StyledCollapse>
        </StyledCard>
    );
};
