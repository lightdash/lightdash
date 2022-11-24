import { AnchorButton, Button, Colors, Icon, Tag } from '@blueprintjs/core';
import styled, { css } from 'styled-components';

export const OpenShareModal = styled(Button)`
    margin-right: 10px;
`;

export const AddUsersWrapper = styled.div`
    display: flex;
    gap: 10px;
`;

export const AccessWrapper = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
`;

export const ListUserWrapper = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
`;

export const FlexWrapper = styled.div`
    display: flex;
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

export const ShareTag = styled.div`
    ${commonTagStyle}
    background-color: ${Colors.LIGHT_GRAY4};
    color: ${Colors.GRAY1};
`;

export const UserTag = styled.div`
    ${commonTagStyle}
    background-color: ${Colors.GRAY3};
    color: ${Colors.WHITE};
`;

export const MemberAccess = styled.div`
    flex: auto;
`;

export const AccessSelectTitle = styled.div`
    font-weight: 600;
    font-size: 13px;

    color: ${Colors.DARK_GRAY1};
`;

export const AccessSelectSubtitle = styled.div`
    font-weight: 400;
    font-size: 12px;
    color: ${Colors.GRAY2};
    width: 200px;
`;

export const AccessName = styled.div`
    font-weight: 600;
    font-size: 13px;
`;

export const AccessDescription = styled.div`
    font-size: 12px;
    font-weight: 400;
    color: ${Colors.GRAY1};
`;

export const UserName = styled.div`
    flex: 1;
    font-weight: 600;
    font-size: 13px;
`;

export const AccessRole = styled.div`
    flex-grow: 0;
    flex-shrink: 0;
    text-align: right;
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

    padding: 10px 20px;
`;

export const UserRole = styled.div`
    text-align: right;
    font-weight: 500 !important;
    font-size: 13px !important;
`;

export const YouLabel = styled.span`
    font-weight: 300;
`;

export const SelectIcon = styled(Icon)``;
