import { Button, HTMLSelect, Tag } from '@blueprintjs/core';
import styled from 'styled-components';

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
