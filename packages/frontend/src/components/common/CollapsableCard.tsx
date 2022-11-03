import { CardProps, CollapseProps } from '@blueprintjs/core';
import { FC, useCallback } from 'react';
import {
    StyledButton,
    StyledCard,
    StyledCardActionsWrpper,
    StyledCardHeader,
    StyledCardTitle,
    StyledCardTitleWrapper,
    StyledCollapse,
    TRANSITION_DURATION,
} from './CollapsableCard.style';

export { StyledCardDivider as CardDivider } from './CollapsableCard.style';

type CollapsableCardProps = {
    disabled?: boolean;
    headerActions?: React.ReactNode;
    shouldExpand?: boolean;
    onToggle?: (isOpen: boolean) => void;
} & Pick<CollapseProps, 'children' | 'isOpen'> &
    Pick<CardProps, 'title'>;

const CollapsableCard: FC<CollapsableCardProps> = ({
    title,
    children,
    headerActions,
    onToggle,
    isOpen,
    shouldExpand = false,
    disabled = false,
}) => {
    const handleToggle = useCallback(
        (value: boolean) => onToggle?.(value),
        [onToggle],
    );

    return (
        <StyledCard elevation={1} isOpen={isOpen} $shouldExpand={shouldExpand}>
            <StyledCardHeader>
                <StyledCardTitleWrapper>
                    <StyledButton
                        minimal
                        disabled={disabled}
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

            <StyledCollapse
                transitionDuration={TRANSITION_DURATION}
                isOpen={isOpen}
                $shouldExpand={shouldExpand}
            >
                {children}
            </StyledCollapse>
        </StyledCard>
    );
};

export default CollapsableCard;
