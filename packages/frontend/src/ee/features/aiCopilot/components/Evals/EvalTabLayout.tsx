import { useMantineTheme } from '@mantine-8/core';
import { IconGripVertical } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useParams } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useEvalTabContext } from '../../hooks/useEvalTabContext';
import { ThreadPreviewSidebar } from '../Admin/ThreadPreviewSidebar';
import styles from './EvalTabLayout.module.css';

type EvalTabLayoutProps = {
    children: ReactNode;
};

export const EvalTabLayout: FC<EvalTabLayoutProps> = ({ children }) => {
    const theme = useMantineTheme();
    const { projectUuid, agentUuid } = useParams<{
        projectUuid: string;
        agentUuid: string;
    }>();
    const { selectedThreadUuid, isSidebarOpen, clearThread } =
        useEvalTabContext();

    const handleCloseSidebar = () => {
        clearThread();
    };

    return (
        <PanelGroup direction="horizontal">
            <Panel
                id="eval-content"
                defaultSize={isSidebarOpen ? 50 : 100}
                minSize={30}
                className={styles.evalContent}
            >
                {children}
            </Panel>

            {isSidebarOpen && (
                <>
                    <PanelResizeHandle
                        className={styles.resizeHandle}
                        style={{
                            width: 2,
                            backgroundColor: theme.colors.gray[3],
                            cursor: 'col-resize',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <MantineIcon
                            color="gray"
                            icon={IconGripVertical}
                            size="sm"
                        />
                    </PanelResizeHandle>
                    <Panel
                        id="thread-preview"
                        defaultSize={50}
                        minSize={25}
                        maxSize={70}
                        className={styles.threadPanel}
                    >
                        {!!selectedThreadUuid &&
                            !!projectUuid &&
                            !!agentUuid && (
                                <ThreadPreviewSidebar
                                    projectUuid={projectUuid}
                                    agentUuid={agentUuid}
                                    threadUuid={selectedThreadUuid}
                                    isOpen={isSidebarOpen}
                                    onClose={handleCloseSidebar}
                                />
                            )}
                    </Panel>
                </>
            )}
        </PanelGroup>
    );
};
