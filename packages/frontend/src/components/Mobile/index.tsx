import { AnchorButton } from '@blueprintjs/core';
import React from 'react';
import {
    Content,
    DarkLogo,
    Icon,
    MobileFooter,
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
        </Content>

        <MobileFooter>
            <AnchorButton
                href="https://github.com/lightdash/lightdash/discussions"
                target="_blank"
                minimal
                icon="chat"
                style={{ margin: '0' }}
            >
                Join the conversation!
            </AnchorButton>
        </MobileFooter>
    </MobileViewWrapper>
);

export default MobileView;
