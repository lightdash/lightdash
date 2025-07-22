import { useMantineTheme } from '@mantine-8/core';
import { Fragment, type PropsWithChildren, type ReactNode } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { NAVBAR_HEIGHT } from '../../../../components/common/Page/constants';
import ErrorBoundary from '../../../../features/errorBoundary/ErrorBoundary';

interface Props extends PropsWithChildren {
    Sidebar?: ReactNode;
}
export const AiAgentPageLayout = ({ Sidebar, children }: Props) => {
    const theme = useMantineTheme();

    return (
        <PanelGroup
            direction="horizontal"
            style={{
                // TODO: Need to consider preview banner
                height: `calc(100vh - ${NAVBAR_HEIGHT}px)`,
                backgroundColor: 'white',
            }}
        >
            {Sidebar && (
                <Fragment>
                    <ErrorBoundary>
                        <Panel
                            defaultSize={20}
                            minSize={20}
                            maxSize={40}
                            style={{
                                padding: theme.spacing.lg,
                                overflow: 'auto',
                                backgroundColor: theme.colors.gray[0],
                            }}
                        >
                            {Sidebar}
                        </Panel>
                    </ErrorBoundary>

                    <PanelResizeHandle
                        style={{
                            width: '1.5px',
                            backgroundColor: theme.colors.gray[2],
                            cursor: 'col-resize',
                        }}
                    />
                </Fragment>
            )}
            <ErrorBoundary>
                <Panel style={{ backgroundColor: 'white' }}>{children}</Panel>
            </ErrorBoundary>
        </PanelGroup>
    );
};
