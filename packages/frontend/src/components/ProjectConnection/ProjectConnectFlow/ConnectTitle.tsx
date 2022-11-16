import { FC } from 'react';
import { Title } from './ProjectConnectFlow.styles';

interface ConnectTitleProps {
    isCreatingFirstProject: boolean;
}

const ConnectTitle: FC<ConnectTitleProps> = ({ isCreatingFirstProject }) => {
    return isCreatingFirstProject ? (
        <Title>Let's get you set up! 🎉</Title>
    ) : (
        <Title>Connect new project</Title>
    );
};

export default ConnectTitle;
