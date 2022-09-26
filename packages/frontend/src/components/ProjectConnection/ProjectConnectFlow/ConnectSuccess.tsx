import { Button } from '@blueprintjs/core';
import { FC } from 'react';
import { useHistory } from 'react-router-dom';
import {
    ConnectWarehouseWrapper,
    StyledSuccessIcon,
    Subtitle,
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
                <Subtitle>Your project's been created! 🎉</Subtitle>

                <StyledSuccessIcon
                    icon="tick-circle"
                    intent="success"
                    size={64}
                />

                <Button
                    large
                    intent="primary"
                    onClick={() => {
                        history.replace(`/projects/${projectUuid}`);
                    }}
                >
                    Let's do some data
                </Button>
            </ConnectWarehouseWrapper>
        </Wrapper>
    );
};

export default ConnectSuccess;
