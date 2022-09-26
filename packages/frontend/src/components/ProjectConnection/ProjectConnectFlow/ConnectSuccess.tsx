import { Button, Colors } from '@blueprintjs/core';
import { FC } from 'react';
import { useHistory } from 'react-router-dom';
import {
    ConnectWarehouseWrapper,
    StyledSuccessIcon,
    Title,
    Wrapper,
} from './ProjectConnectFlow.styles';

interface ConnectSuccessProps {
    projectUuid: string;
}

const ConnectSuccess: FC<ConnectSuccessProps> = ({ projectUuid }) => {
    const history = useHistory();

    return (
        <Wrapper>
            <ConnectWarehouseWrapper>
                <Title>Your project's been created! 🎉</Title>

                <StyledSuccessIcon
                    icon="tick-circle"
                    color={Colors.GREEN4}
                    size={64}
                />

                <Button
                    large
                    intent="primary"
                    onClick={() => {
                        history.replace(`/projects/${projectUuid}`);
                    }}
                >
                    Let's do some data!
                </Button>
            </ConnectWarehouseWrapper>
        </Wrapper>
    );
};

export default ConnectSuccess;
