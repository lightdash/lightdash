import {
    Button,
    Icon,
    PopoverInteractionKind,
    Position,
    Spinner,
} from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import React, { FC } from 'react';
import {
    ButtonWrapper,
    HelpItem,
    IconContainer,
    ItemCTA,
    ItemDescription,
    LinkWrapper,
    MenuWrapper,
} from './HelpMenu.styles';

interface Props {
    projectId: string | undefined;
}

const HelpMenu: FC<Props> = ({ projectId }) => {
    const openChatWindow = () => {
        (window as any).$chatwoot?.toggle('true');
    };

    return (
        <>
            <Popover2
                interactionKind={PopoverInteractionKind.CLICK}
                content={
                    !projectId ? (
                        <div
                            style={{
                                padding: 10,
                                minWidth: 90,
                            }}
                        >
                            <Spinner size={20} />
                        </div>
                    ) : (
                        <MenuWrapper>
                            <ButtonWrapper onClick={() => openChatWindow()}>
                                <HelpItem>
                                    <IconContainer>
                                        <Icon icon="chat" />
                                    </IconContainer>
                                    <div>
                                        <ItemCTA>Contact support</ItemCTA>
                                        <ItemDescription>
                                            Drop us a message and we’ll get back
                                            to you asap!
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
                                            Get advice &amp; share best
                                            practices with other users.
                                        </ItemDescription>
                                    </div>
                                </HelpItem>
                            </LinkWrapper>
                        </MenuWrapper>
                    )
                }
                position={Position.BOTTOM_LEFT}
            >
                <Button minimal icon="help" text="Help" />
            </Popover2>
        </>
    );
};

export default HelpMenu;
