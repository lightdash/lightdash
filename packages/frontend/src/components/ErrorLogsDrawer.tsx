import {
    Button,
    Card,
    Drawer,
    DrawerSize,
    Intent,
    Position,
    Tag,
} from '@blueprintjs/core';
import MDEditor from '@uiw/react-md-editor';
import React from 'react';
import { ErrorLogEntry, useErrorLogs } from '../providers/ErrorLogsProvider';

const ErrorCard: React.FC<ErrorLogEntry & { onDismiss: () => void }> = ({
    title,
    body,
    isUnread,
    onDismiss,
}) => (
    <Card
        style={{
            margin: 10,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
        }}
    >
        {isUnread && (
            <Tag intent={Intent.DANGER} round style={{ marginRight: 15 }}>
                New
            </Tag>
        )}
        <div
            style={{
                flex: 1,
                padding: 0,
                margin: 0,
                borderRadius: 0,
                boxShadow: 'none',
            }}
        >
            <p style={{ fontWeight: 'bold', marginBottom: 0 }}>{title}</p>
            {body && (
                <MDEditor.Markdown
                    source={body.replace('\n', '\n\n')}
                    linkTarget="_blank"
                />
            )}
        </div>
        <Button
            small
            minimal
            text="Dismiss"
            rightIcon="cross"
            onClick={onDismiss}
        />
    </Card>
);

export const ErrorLogsDrawer = () => {
    const errorLogs = useErrorLogs();
    return (
        <Drawer
            autoFocus
            canEscapeKeyClose
            canOutsideClickClose
            enforceFocus
            hasBackdrop
            icon="application"
            isCloseButtonShown
            isOpen={errorLogs.errorLogsVisible}
            onClose={() => errorLogs.setErrorLogsVisible(false)}
            onClosed={errorLogs.setAllLogsRead}
            shouldReturnFocusOnClose
            size={DrawerSize.SMALL}
            title="Error logs"
            position={Position.TOP}
        >
            <div
                style={{
                    height: '100%',
                    overflowY: 'auto',
                }}
            >
                {errorLogs.errorLogs
                    .map((entry, idx) => (
                        <ErrorCard
                            key={entry.timestamp.getTime()}
                            timestamp={entry.timestamp}
                            title={entry.title}
                            body={entry.body}
                            isUnread={entry.isUnread}
                            onDismiss={() => errorLogs.deleteErrorLogEntry(idx)}
                        />
                    ))
                    .slice(0)
                    .reverse()}
            </div>
        </Drawer>
    );
};
