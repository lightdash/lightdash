import { AnchorButton, Button, Classes, Colors } from '@blueprintjs/core';
import styled, { css } from 'styled-components';

export const FlexWrapper = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

export const ShareButton = styled(Button)`
    width: 100px;
    text-align: center;
    border-radius: 3px;
`;

export const ChangeAccessButton = styled(AnchorButton)`
    height: 24px;
    padding: 0 2px 0 5px;
`;

const commonTagStyle = css`
    width: 35px;
    height: 35px;
    border-radius: 100%;
    display: flex;
    flex-shrink: 0;
    justify-content: center;
    align-items: center;
`;

export const UserCircle = styled.div`
    ${commonTagStyle}
    background-color: ${Colors.GRAY3};
    color: ${Colors.WHITE};
`;

interface PrimaryAndSecondaryTextWrapperProps {
    $disabled?: boolean;
}

export const PrimaryAndSecondaryTextWrapper = styled.div<PrimaryAndSecondaryTextWrapperProps>`
    flex-grow: 1;
    overflow: hidden;
    max-width: 100%;
    ${({ $disabled }) => ($disabled ? `opacity: 0.5;` : '')}
`;

interface PrimaryButtonProps {
    $selected?: boolean;
}

export const PrimaryText = styled.div<PrimaryButtonProps>`
    flex: 1;
    font-weight: 600;
    font-size: 13px;
    color: ${(props) => (props.$selected ? Colors.BLUE2 : Colors.DARK_GRAY1)};
`;

PrimaryText.defaultProps = {
    className: Classes.TEXT_OVERFLOW_ELLIPSIS,
};

const secondaryTextStyles = css`
    flex: 1;
    font-weight: 400;
    font-size: 12px;
    color: ${Colors.GRAY2};
`;

export const SecondaryText = styled.div`
    ${secondaryTextStyles}
`;

SecondaryText.defaultProps = {
    className: Classes.TEXT_OVERFLOW_ELLIPSIS,
};

export const SecondaryTextWithMaxWidth = styled.div`
    ${secondaryTextStyles};
    max-width: 200px;
`;

export const AccessRole = styled.div`
    flex-grow: 0;
    flex-shrink: 0;
`;

export const UserRole = styled.div`
    text-align: right;
    font-weight: 500 !important;
    font-size: 13px !important;
`;

export const YouLabel = styled.span`
    font-weight: 300;
`;
