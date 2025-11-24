import { type AiAgentVerifiedArtifact } from '@lightdash/common';
import { Box, Stack, Text, useMantineTheme } from '@mantine-8/core';
import { IconGripVertical } from '@tabler/icons-react';
import { type FC, useEffect } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useParams } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { NAVBAR_HEIGHT } from '../../../../../components/common/Page/constants';
import { clearArtifact, setArtifact } from '../../store/aiArtifactSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import { AiArtifactPanel } from '../ChatElements/AiArtifactPanel';
import styles from './VerifiedArtifactsLayout.module.css';
import { VerifiedArtifactsTable } from './VerifiedArtifactsTable';

export const VerifiedArtifactsLayout: FC = () => {
    const theme = useMantineTheme();
    const { projectUuid, agentUuid } = useParams();
    const dispatch = useAiAgentStoreDispatch();
    const artifact = useAiAgentStoreSelector(
        (state) => state.aiArtifact.artifact,
    );

    const handleArtifactSelect = (
        selectedArtifact: AiAgentVerifiedArtifact,
    ) => {
        dispatch(
            setArtifact({
                projectUuid: projectUuid!,
                agentUuid: agentUuid!,
                artifactUuid: selectedArtifact.artifactUuid,
                versionUuid: selectedArtifact.versionUuid,
                messageUuid: selectedArtifact.promptUuid || '',
                threadUuid: selectedArtifact.threadUuid,
            }),
        );
    };

    useEffect(() => {
        return () => {
            dispatch(clearArtifact());
        };
    }, [dispatch]);

    return (
        <PanelGroup
            direction="horizontal"
            style={{ height: `calc(100vh - ${NAVBAR_HEIGHT}px)` }}
        >
            <Panel
                id="verified-artifacts-table"
                defaultSize={artifact ? 40 : 100}
                minSize={30}
            >
                <Stack gap="sm" mt="lg" pr="md">
                    <Stack gap="md">
                        <Stack gap="xs">
                            <Text size="lg" fw={500}>
                                Verified Answers
                            </Text>
                            <Text size="sm" c="dimmed">
                                Manage verified charts and dashboards that the
                                AI agent can reference in conversations.
                            </Text>
                        </Stack>
                    </Stack>
                    <VerifiedArtifactsTable
                        onArtifactSelect={handleArtifactSelect}
                        selectedArtifactVersionUuid={
                            artifact?.versionUuid ?? null
                        }
                    />
                </Stack>
            </Panel>

            {artifact && (
                <>
                    <PanelResizeHandle
                        className={styles.resizeHandle}
                        style={{
                            width: 1.5,
                            backgroundColor: theme.colors.ldGray[2],
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
                        id="artifact-preview"
                        defaultSize={60}
                        minSize={25}
                        maxSize={70}
                    >
                        <Box h="100%" pos="relative" bg="white">
                            <AiArtifactPanel
                                artifact={artifact}
                                showCloseButton={true}
                            />
                        </Box>
                    </Panel>
                </>
            )}
        </PanelGroup>
    );
};
