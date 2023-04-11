import { AnchorButton } from '@blueprintjs/core';
import React from 'react';
import {
    Button,
    Content,
    DarkLogo,
    Icon,
    MobileViewWrapper,
    Paragraph,
    Text,
} from './Mobile.styles';

const MobileView = () => (
    <MobileViewWrapper>
        <Content>
            <DarkLogo title="Home" />
            <Icon>&#128586;</Icon>
            <Text>Lightdash currently works best on bigger screens.</Text>
            <Paragraph>
                Sign in on a laptop or desktop to get started! In the meantime:
            </Paragraph>
            <AnchorButton href="https://www.lightdash.com/" target="_blank">
                <Button>Check out our website</Button>
            </AnchorButton>
        </Content>
    </MobileViewWrapper>
);

export default MobileView;
