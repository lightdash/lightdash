import { Colors, H1, Icon } from '@blueprintjs/core';
import React, { FC } from 'react';
import { Logo, LogoWrapper, SuccessWrapper } from '../../pages/SignUp.styles';
import LightdashLogo from '../../svgs/lightdash-black.svg';

const SuccessfulEmailVerification: FC = () => {
    return (
        <>
            <LogoWrapper>
                <Logo src={LightdashLogo} />
            </LogoWrapper>
            <SuccessWrapper>
                <H1>Great, you're verified!</H1>
                <Icon icon="tick-circle" color={Colors.GREEN3} size={100} />
            </SuccessWrapper>
        </>
    );
};

export default SuccessfulEmailVerification;
