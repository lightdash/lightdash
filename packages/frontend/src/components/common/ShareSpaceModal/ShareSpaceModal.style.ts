import { AnchorButton, Button, Classes, Colors } from '@blueprintjs/core';
import styled, { css } from 'styled-components';

export const OpenShareModal = styled(Button)`
    margin-right: 10px;
`;

export const FlexWrapper = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
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

export const ShareCircle = styled.div`
    ${commonTagStyle}
    background-color: ${Colors.LIGHT_GRAY4};
    color: ${Colors.GRAY1};
`;

export const UserCircle = styled.div`
    ${commonTagStyle}
    background-color: ${Colors.GRAY3};
    color: ${Colors.WHITE};
`;

export const MemberAccess = styled.div`
    flex-grow: 1;
    overflow: hidden;
    max-width: 100%;
`;

export const PrimaryText = styled.div`
    flex: 1;
    font-weight: 600;
    font-size: 13px;
    color: ${Colors.DARK_GRAY1};
`;

PrimaryText.defaultProps = {
    className: Classes.TEXT_OVERFLOW_ELLIPSIS,
};

const secondaryTextStyles = css`
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

export const DialogBody = styled.div`
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 20px;
`;

export const DialogFooter = styled.div`
    background-color: ${Colors.LIGHT_GRAY5};
    border-top: 1px solid ${Colors.LIGHT_GRAY1};
    border-radius: 0 0 2px 2px;

    color: ${Colors.GRAY1};
    font-size: 12px;
    font-weight: 400;

    padding: 10px 20px 12px 20px;
    // 12px is intentional to fix optical alignment
`;

export const UserRole = styled.div`
    text-align: right;
    font-weight: 500 !important;
    font-size: 13px !important;
`;

export const YouLabel = styled.span`
    font-weight: 300;
`;
