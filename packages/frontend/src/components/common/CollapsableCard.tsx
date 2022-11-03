import { Tooltip2 } from '@blueprintjs/popover2';
import { FC, useCallback } from 'react';
import {
    StyledButton,
    StyledCard,
    StyledCardActionsWrpper,
    StyledCardHeader,
    StyledCardTitle,
    StyledCardTitleWrapper,
    StyledCollapse,
} from './CollapsableCard.style';

export { StyledCardDivider as CardDivider } from './CollapsableCard.style';

interface CollapsableCardProps {
    onToggle?: (isOpen: boolean) => void;
    isOpen?: boolean;
    disabled?: boolean;
    shouldExpand?: boolean;
    toggleTooltip?: string;
    title: string;
    headerElement?: JSX.Element;
    rightHeaderElement?: React.ReactNode;
}

const CollapsableCard: FC<CollapsableCardProps> = ({
    children,
    onToggle,
    isOpen = false,
    toggleTooltip,
    shouldExpand = false,
    disabled = false,
    title,
    headerElement,
    rightHeaderElement,
}) => {
    const handleToggle = useCallback(
        (value: boolean) => onToggle?.(value),
        [onToggle],
    );

    return (
        <StyledCard elevation={1} isOpen={isOpen} $shouldExpand={shouldExpand}>
            <StyledCardHeader>
                <StyledCardTitleWrapper>
                    <Tooltip2
                        interactionKind="hover"
                        placement="bottom-start"
                        disabled={!!toggleTooltip}
                        content={toggleTooltip}
                    >
                        <StyledButton
                            minimal
                            disabled={disabled}
                            icon={isOpen ? 'chevron-down' : 'chevron-right'}
                            onClick={() => handleToggle(!isOpen)}
                        />
                    </Tooltip2>

                    <StyledCardTitle>{title}</StyledCardTitle>

                    {headerElement && (
                        <StyledCardActionsWrpper>
                            {headerElement}
                        </StyledCardActionsWrpper>
                    )}
                </StyledCardTitleWrapper>

                {rightHeaderElement && (
                    <StyledCardActionsWrpper>
                        {rightHeaderElement}
                    </StyledCardActionsWrpper>
                )}
            </StyledCardHeader>

            {isOpen && (
                <StyledCollapse $shouldExpand={shouldExpand}>
                    {children}
                </StyledCollapse>
            )}
        </StyledCard>
    );
};

export default CollapsableCard;
