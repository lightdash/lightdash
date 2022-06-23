import {
    Button,
    Card,
    Collapse,
    HTMLSelect,
    Icon,
    Tag,
} from '@blueprintjs/core';
import styled from 'styled-components';

export const ProjectAccessWrapper = styled.div`
    margin-top: 20px;
    padding-bottom: 50px;
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

export const UserEmail = styled(Tag)`
    width: fit-content;
    margin-top: 0.3em;
`;

export const RoleSelectButton = styled(HTMLSelect)`
    margin-right: 0.5em;
`;

export const AddUserButton = styled(Button)`
    float: right;
`;

export const OrgAccess = styled.div`
    margin-top: 40px;
    width: 100%;
`;

export const OrgAccessHeader = styled.div`
    display: flex;
    justify-content: flex-start;
    align-items: center;
`;
export const OrgAccessTitle = styled.p`
    margin: 0;
    padding: 0;
    margin-right: 10px;
`;

// @ts-ignore
export const OrgAccessList = styled(Collapse)`
    margin-top: 25px;
`;

export const RelevantOrgRoleIcon = styled(Icon)`
    margin-right: 10px;
`;
