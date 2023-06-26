import { Tooltip2 } from '@blueprintjs/popover2';
import { ButtonProps, PopoverProps } from '@mantine/core';
import { IconCaretDown } from '@tabler/icons-react';
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
import MantineIcon from './MantineIcon';

export const COLLAPSABLE_CARD_BUTTON_PROPS: Omit<ButtonProps, 'children'> = {
    variant: 'subtle',
    size: 'xs',
    rightIcon: <MantineIcon icon={IconCaretDown} />,
};

export const COLLAPSABLE_CARD_POPOVER_PROPS: Omit<PopoverProps, 'children'> = {
    shadow: 'md',
    position: 'bottom',
    withArrow: true,
    closeOnClickOutside: true,
    closeOnEscape: true,
    keepMounted: false,
    arrowSize: 10,
    offset: -2,
};

interface CollapsableCardProps {
    onToggle?: (isOpen: boolean) => void;
    isOpen?: boolean;
    disabled?: boolean;
    shouldExpand?: boolean;
    minHeight?: number;
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
    minHeight = 300,
}) => {
    const handleToggle = useCallback(
        (value: boolean) => onToggle?.(value),
        [onToggle],
    );

    return (
        <StyledCard elevation={1} $shouldExpand={isOpen && shouldExpand}>
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
                <StyledCollapse
                    $shouldExpand={isOpen && shouldExpand}
                    $minHeight={minHeight}
                >
                    {shouldExpand ? (
                        <div
                            style={{
                                position: 'relative',
                                width: '100%',
                                height: '100%',
                            }}
                        >
                            <div
                                style={{
                                    position: 'absolute',
                                    left: 0,
                                    right: 0,
                                    top: 0,
                                    bottom: 0,
                                    overflow: 'hidden',
                                    display: 'flex',
                                    flexDirection: 'column',
                                }}
                            >
                                {children}
                            </div>
                        </div>
                    ) : (
                        children
                    )}
                </StyledCollapse>
            )}
        </StyledCard>
    );
};

export default CollapsableCard;
