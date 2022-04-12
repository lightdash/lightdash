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
} from './HelpMenu.styles';

const HelpMenu: FC = () => {
    useEffect(() => {
        const script = document.createElement('script');
        script.async = false;
        script.src = 'https://cdn.headwayapp.co/widget.js';
        document.head.appendChild(script);
        var config = {
            selector: '.headway-badge',
            account: '7L3Bzx',
        };
        script.onload = function () {
            //@ts-ignore
            window.Headway.init(config);
        };
        /*
<script>
  // @see https://docs.headwayapp.co/widget for more configuration options.
  var HW_config = {
    selector: ".headway-badge", // CSS selector where to inject the badge
    account:  "7L3Bzx"
  }
</script>
<script async src="https://cdn.headwayapp.co/widget.js"></script>

*/
        /*  const script = document.createElement('script')
        script.innerHTML = `
  // @see https://docs.headwayapp.co/widget for more configuration options.
  var HW_config = {
    selector: ".CHANGE_THIS", // CSS selector where to inject the badge
    account:  "7L3Bzx"
  }
<script async src="https://cdn.headwayapp.co/widget.js"></script>
`
        document.body.appendChild(script)*/
    }, []);

    const openChatWindow = () => {
        (window as any).$chatwoot?.toggle('true');
    };

    return (
        <>
            <div className="headway-badge" style={{ marginTop: 30 }}>
                <Icon icon="notifications" />
            </div>
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
                <Button minimal icon="help" text="Help" />
            </Popover2>
        </>
    );
};

export default HelpMenu;
