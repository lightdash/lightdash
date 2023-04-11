import { Anchor } from '@mantine/core';
import React from 'react';
import {
    Button,
    Content,
    DarkLogo,
    Icon,
    LinkText,
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
            <Anchor
                style={{ width: '17.25rem', height: '2.5rem' }}
                href="https://www.lightdash.com/"
                target="_blank"
            >
                <Button>Check out our website</Button>
            </Anchor>
            <Anchor
                href="https://join.slack.com/t/lightdash-community/shared_invite/zt-16q953ork-NZr1qdEqxSwB17E2ckUe7A"
                target="_blank"
            >
                <LinkText>...or join our community!</LinkText>
            </Anchor>
        </Content>
    </MobileViewWrapper>
);

export default MobileView;
