import { type AiAgentVerifiedArtifact } from '@lightdash/common';
import { Box, Stack, Text } from '@mantine/core';
import { IconGripVertical } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import { useParams } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { NAVBAR_HEIGHT } from '../../../../../components/common/Page/constants';
import ResizableSplitter from '../../../../../components/common/ResizableSplitter';
import { useProjectUuid } from '../../../../../hooks/useProjectUuid';
import {
    clearPreview,
    selectArtifactPreview,
    setPreview,
} from '../../store/aiArtifactSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import { AiArtifactPanel } from '../ChatElements/AiArtifactPanel';
import styles from './VerifiedArtifactsLayout.module.css';
import { VerifiedArtifactsTable } from './VerifiedArtifactsTable';

export const VerifiedArtifactsLayout: FC = () => {
    const { agentUuid } = useParams();
    const projectUuid = useProjectUuid();
    const dispatch = useAiAgentStoreDispatch();
    const artifact = useAiAgentStoreSelector(selectArtifactPreview);

    const handleArtifactSelect = (
        selectedArtifact: AiAgentVerifiedArtifact,
    ) => {
        dispatch(
            setPreview({
                type: 'artifact',
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
            dispatch(clearPreview());
        };
    }, [dispatch]);

    return (
        <ResizableSplitter
            withHandle
            lineSize={1.5}
            handleColor="ldGray.2"
            handleIcon={
                <MantineIcon color="gray" icon={IconGripVertical} size="sm" />
            }
            classNames={{ handle: styles.resizeHandle }}
            orientation="horizontal"
            style={{ height: `calc(100vh - ${NAVBAR_HEIGHT}px)` }}
        >
            <ResizableSplitter.Pane
                id="verified-artifacts-table"
                defaultSize={artifact ? 40 : 100}
                min={30}
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
            </ResizableSplitter.Pane>

            {artifact && (
                <ResizableSplitter.Pane
                    id="artifact-preview"
                    defaultSize={60}
                    min={25}
                    max={70}
                >
                    <Box h="100%" pos="relative" bg="white">
                        <AiArtifactPanel
                            artifact={artifact}
                            showCloseButton={true}
                        />
                    </Box>
                </ResizableSplitter.Pane>
            )}
        </ResizableSplitter>
    );
};
