import {
    Button,
    Card,
    H5,
    HTMLSelect,
    InputGroup,
    Tag,
} from '@blueprintjs/core';
import styled from 'styled-components';
import SimpleButton from '../../common/SimpleButton';

export const UserManagementPanelWrapper = styled.div`
    width: 100%;
    display: flex;
    flex-direction: column;
`;

export const UserListItemWrapper = styled(Card)`
    display: flex;
    flex-direction: column;
    margin-bottom: 1.25em;
    width: 100%;
`;

export const ItemContent = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
`;
export const SectionWrapper = styled.div`
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
`;

export const UserInfo = styled.div`
    margin: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
`;

export const UserName = styled.b`
    margin: 0;
    margin-right: 0.625em;
`;

export const PendingEmail = styled.b`
    margin: 0;
    margin-right: 0.625em;
`;

export const UserEmail = styled(Tag)`
    width: fit-content;
    margin-top: 0.3em;
`;

export const PendingTag = styled(Tag)`
    width: fit-content;
    margin-top: 0.3em;
`;

export const RoleSelectButton = styled(HTMLSelect)`
    margin-right: 0.5em;
`;

export const AddUserButton = styled(Button)`
    align-self: flex-end;
`;
export const NewLinkButton = styled(SimpleButton)`
    padding-left: 0;
    font-size: 12px;
    margin-left: 10px;
`;

export const InviteSuccess = styled.div`
    margin-top: 10px;
    width: 100%;
`;

export const InviteInput = styled(InputGroup)`
    margin-top: 10px;
    margin-bottom: 0;
    width: 100%;
`;

export const HeaderWrapper = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
`;

export const PanelTitle = styled(H5)`
    margin: 0;
`;
