import { Card, Colors, Elevation, Icon, Overlay } from '@blueprintjs/core';
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
                <Card
                    elevation={Elevation.TWO}
                    interactive
                    style={{
                        right: 0,
                        bottom: 0,
                        position: 'fixed',
                        margin: 25,
                        padding: 0,
                        width: 60,
                        height: 60,
                        borderRadius: 30,
                        background: Colors.BLUE1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                    onClick={openChatWindow}
                >
                    <Icon icon="chat" style={{ color: Colors.LIGHT_GRAY5 }} />
                </Card>
            </Overlay>
        );
    }
    return null;
};
