import { Title } from '@mantine/core';
import { FC } from 'react';

interface ConnectTitleProps {
    isCreatingFirstProject: boolean;
}

const ConnectTitle: FC<ConnectTitleProps> = ({ isCreatingFirstProject }) => {
    return isCreatingFirstProject ? (
        <Title order={2}>Let's get you set up!</Title>
    ) : (
        <Title order={2}>Connect new project</Title>
    );
};

export default ConnectTitle;
