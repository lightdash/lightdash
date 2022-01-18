import React from 'react';
import { Permission, RoleWrapper, UserName } from './Role.styles';

const Role = () => (
    <RoleWrapper>
        <UserName>Lola</UserName>

        <Permission>Viewer</Permission>
    </RoleWrapper>
);

export default Role;
