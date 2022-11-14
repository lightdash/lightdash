import { Button, Card, Colors, H5, Tag } from '@blueprintjs/core';
import styled from 'styled-components';

export const OpenShareModal = styled(Button)`
    margin-right: 10px;
`;

export const AddUsersWrapper = styled.div`
    display: flex;
    margin: 5px 5px 15px 5px;
`;

export const AccessWrapper = styled.div`
    display: flex;

    margin: 5px 5px 15px 5px;
`;

export const FlexWrapper = styled.div`
    display: flex;
`;

export const UserListWrapper = styled.div`
    margin: 5px 5px 5px 5px;
`;

export const ShareButton = styled(Button)`
    width: 100px;
    text-align: center;
    margin-left: 10px;
    border-radius: 3px;
`;

export const ChangeAccessButton = styled(Button)`
    padding-right: 0;
    font-weight: 600;
    font-size: 13px;
    text-align: right;
    margin-top: 2px;
`;
export const ShareTag = styled(Tag)`
    width: 35px;
    height: 35px;
    padding: 0 0 0 10px !important;
    background-color: lightgray;
    color: ${Colors.GRAY1};
`;
export const UserTag = styled(Tag)`
    width: 35px;
    height: 35px;
    padding: 0 0 0 8px !important;
    background-color: #8f99a8;
    color: ${Colors.WHITE};
`;
export const Hightlighed = styled.span`
    color: ${Colors.BLUE3};
`;

export const MemberAccess = styled.div`
    flex: auto;
    margin: 0px 0px 0 10px;
`;

export const AccessSelectTitle = styled.p`
    font-weight: 600;
    font-size: 13px;
    line-height: 20px;
    margin-bottom: 0;

    color: ${Colors.DARK_GRAY1};
`;

export const AccessSelectSubtitle = styled.p`
    font-weight: 400;
    font-size: 12px;
    line-height: 18px;
    color: ${Colors.GRAY2};
    width: 200px;
`;

export const AccessName = styled.p`
    font-weight: 600;
    font-size: 13px;
    line-height: 20px;
    margin-bottom: 0;
`;
export const AccessDescription = styled.p`
    font-size: 12px;
    font-weight: 400;
    line-height: 20px;
    color: ${Colors.GRAY1};
    margin-bottom: 0;
`;
export const UserName = styled.p`
    font-weight: 600;
    font-size: 13px;
    margin-top: 6px;
    line-height: 20px;
    margin: 5px 0px 0 10px;
`;
export const AccessRole = styled.div`
    flex: 2;
    text-align: right;
`;

export const DialogFooter = styled.div`
    height: 40px;
    background-color: ${Colors.LIGHT_GRAY5};
    border-top: 1px solid ${Colors.LIGHT_GRAY1};
    border-radius: 2px;

    p {
        color: ${Colors.GRAY1};
        font-size: 12px;
        line-height: 18px;
        font-weight: 400;
        margin: 11px 0 9px 21px;
    }
`;

export const UserRole = styled.div`
    flex: 2;
    text-align: right;
    margin-top: 5px;
`;
export const YouLabel = styled.span`
    font-weight: 300;
`;
