import { Colors } from '@blueprintjs/core';
import { FC } from 'react';
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
                    href={`/projects/${projectUuid}/home`}
                >
                    Let's do some data!
                </LinkButton>
            </ConnectWarehouseWrapper>
        </Wrapper>
    );
};

export default ConnectSuccess;
