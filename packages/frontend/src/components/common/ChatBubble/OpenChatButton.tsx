import { Button, Colors, Icon, Overlay } from '@blueprintjs/core';
import React from 'react';
import { useApp } from '../../../providers/AppProvider';

export const OpenChatButton: React.FC = () => {
    const { health } = useApp();
    const openChatWindow = () => {
        (window as any).$chatwoot?.toggle('true');
    };
    if (
        health.data?.chatwoot.websiteToken.length &&
        health.data?.chatwoot.baseUrl.length
    ) {
        return (
            <Overlay
                isOpen
                autoFocus={false}
                canEscapeKeyClose={false}
                enforceFocus={false}
                hasBackdrop={false}
                usePortal={false}
            >
                <Button
                    onClick={openChatWindow}
                    style={{
                        background: Colors.BLUE1,
                        borderRadius: 30,
                        width: 60,
                        height: 60,
                        right: 0,
                        bottom: 0,
                        position: 'fixed',
                        margin: 20,
                    }}
                >
                    <Icon icon="chat" style={{ color: Colors.LIGHT_GRAY5 }} />
                </Button>
            </Overlay>
        );
    }
    return null;
};
