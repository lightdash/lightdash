import React, { FC } from 'react';
import { Card, Tag, Classes } from '@blueprintjs/core';
import { OrganizationUser } from 'common';
import { useOrganizationUsers } from '../../hooks/useOrganizationUsers';

const UserListItem: FC<{ user: OrganizationUser }> = ({
    user: { firstName, lastName, email },
}) => (
    <Card
        elevation={0}
        style={{
            display: 'flex',
            flexDirection: 'column',
            marginBottom: '20px',
        }}
    >
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
            }}
        >
            <b
                className={Classes.TEXT_OVERFLOW_ELLIPSIS}
                style={{ margin: 0, marginRight: '10px' }}
            >
                {firstName} {lastName}
            </b>
            {email && <Tag minimal>{email}</Tag>}
        </div>
    </Card>
);

const OrganizationPanel: FC = () => {
    const { data: organizationUsers } = useOrganizationUsers();

    return (
        <div
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
            <div>
                {organizationUsers?.map((user) => (
                    <UserListItem key={user.email} user={user} />
                ))}
            </div>
        </div>
    );
};

export default OrganizationPanel;
