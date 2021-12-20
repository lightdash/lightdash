import { Card, Colors, Elevation, Icon, Overlay } from '@blueprintjs/core';
import { LightdashMode } from 'common';
import React, { useCallback, useEffect } from 'react';
import { useApp } from '../../../providers/AppProvider';

export const OpenChatButton: React.FC = () => {
    const { health, user } = useApp();

    const identify = useCallback(() => {
        if (
            user.data &&
            health.data?.mode !== LightdashMode.DEMO &&
            !user.data.isTrackingAnonymized
        ) {
            (window as any).$chatwoot?.setUser(user.data.userUuid, {
                email: user.data.email,
                name: `${user.data.firstName} ${user.data.lastName}`,
            });
        }
    }, [user, health]);

    useEffect(() => {
        identify();
    }, [identify]);

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
