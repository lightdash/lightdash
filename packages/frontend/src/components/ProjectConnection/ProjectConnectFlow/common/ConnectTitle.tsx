import { Title } from '@mantine/core';
import { FC } from 'react';

interface ConnectTitleProps {
    isCreatingFirstProject: boolean;
}

const ConnectTitle: FC<ConnectTitleProps> = ({ isCreatingFirstProject }) => {
    return (
        <Title order={2} fw={600}>
            {isCreatingFirstProject
                ? "Let's get you set up!"
                : 'Connect new project'}
        </Title>
    );
};

export default ConnectTitle;
