import { Colors } from '@blueprintjs/core';
import { FC } from 'react';
import { useHistory } from 'react-router-dom';
import LinkButton from '../../common/LinkButton';
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

                <LinkButton
                    large
                    intent="primary"
                    href={`/projects/${projectUuid}`}
                >
                    Let's do some data!
                </LinkButton>
            </ConnectWarehouseWrapper>
        </Wrapper>
    );
};

export default ConnectSuccess;
