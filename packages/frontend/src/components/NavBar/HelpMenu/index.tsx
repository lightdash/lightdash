import {
    Button,
    Icon,
    PopoverInteractionKind,
    Position,
} from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import React, { FC, useEffect } from 'react';
import {
    ButtonWrapper,
    HelpItem,
    IconContainer,
    ItemCTA,
    ItemDescription,
    LinkWrapper,
    MenuWrapper,
    NotificationWidget,
    NotificationWrapper,
} from './HelpMenu.styles';

const HelpMenu: FC = () => {
    useEffect(() => {
        //@ts-ignore
        if (window.Headway) return; // don't load it twice
        const script = document.createElement('script');
        script.async = false;
        script.src = 'https://cdn.headwayapp.co/widget.js';
        document.head.appendChild(script);
        script.onload = function () {
            //@ts-ignore
            window.Headway.init({
                selector: '#headway-badge',
                account: '7L3Bzx',
            });
        };
    }, []);

    const openChatWindow = () => {
        (window as any).$chatwoot?.toggle('true');
    };

    return (
        <>
            <NotificationWrapper>
                <Icon icon="notifications" />
                <NotificationWidget id="headway-badge"></NotificationWidget>
            </NotificationWrapper>
            <Popover2
                interactionKind={PopoverInteractionKind.CLICK}
                content={
                    <MenuWrapper>
                        <ButtonWrapper onClick={() => openChatWindow()}>
                            <HelpItem>
                                <IconContainer>
                                    <Icon icon="chat" />
                                </IconContainer>
                                <div>
                                    <ItemCTA>Contact support</ItemCTA>
                                    <ItemDescription>
                                        Drop us a message and we’ll get back to
                                        you asap!
                                    </ItemDescription>
                                </div>
                            </HelpItem>
                        </ButtonWrapper>
                        <LinkWrapper
                            role="button"
                            href="https://docs.lightdash.com/"
                            target="_blank"
                            rel="noreferrer"
                        >
                            <HelpItem>
                                <IconContainer>
                                    <Icon icon="manual" />
                                </IconContainer>
                                <div>
                                    <ItemCTA>View Docs</ItemCTA>
                                    <ItemDescription>
                                        Learn how to deploy, use, &amp;
                                        contribute to Lightdash
                                    </ItemDescription>
                                </div>
                            </HelpItem>
                        </LinkWrapper>
                        <LinkWrapper
                            role="button"
                            href="https://github.com/lightdash/lightdash/discussions"
                            target="_blank"
                            rel="noreferrer"
                        >
                            <HelpItem>
                                <IconContainer>
                                    <Icon icon="people" />
                                </IconContainer>

                                <div>
                                    <ItemCTA>Join the discussion</ItemCTA>
                                    <ItemDescription>
                                        Get advice &amp; share best practices
                                        with other users.
                                    </ItemDescription>
                                </div>
                            </HelpItem>
                        </LinkWrapper>
                    </MenuWrapper>
                }
                position={Position.BOTTOM_LEFT}
            >
                <Button minimal icon="help" />
            </Popover2>
        </>
    );
};

export default HelpMenu;
