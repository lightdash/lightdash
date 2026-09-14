import { Anchor, Box, Breadcrumbs, Stack, Text } from '@mantine/core';
import { useEffect, type FC } from 'react';
import { Panel, PanelGroup } from 'react-resizable-panels';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { NAVBAR_HEIGHT } from '../../../../../components/common/Page/constants';
import { useProjectUuid } from '../../../../../hooks/useProjectUuid';
import { useAiAgentArtifact } from '../../hooks/useAiAgentArtifacts';
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

export const VerifiedArtifactDetail: FC = () => {
    const navigate = useNavigate();
    const { agentUuid, artifactUuid } = useParams();
    const projectUuid = useProjectUuid();
    const [searchParams] = useSearchParams();
    const dispatch = useAiAgentStoreDispatch();
    const artifact = useAiAgentStoreSelector(selectArtifactPreview);

    const versionUuid = searchParams.get('versionUuid');
    const threadUuid = searchParams.get('threadUuid');
    const promptUuid = searchParams.get('promptUuid');

    const { data: artifactData } = useAiAgentArtifact({
        projectUuid: projectUuid!,
        agentUuid: agentUuid!,
        artifactUuid,
        versionUuid: versionUuid!,
        options: {
            enabled: !!(
                projectUuid &&
                agentUuid &&
                artifactUuid &&
                versionUuid
            ),
        },
    });

    useEffect(() => {
        if (
            projectUuid &&
            agentUuid &&
            artifactUuid &&
            versionUuid &&
            threadUuid &&
            promptUuid
        ) {
            dispatch(
                setPreview({
                    type: 'artifact',
                    projectUuid,
                    agentUuid,
                    artifactUuid,
                    versionUuid,
                    messageUuid: promptUuid,
                    threadUuid,
                }),
            );
        }

        return () => {
            dispatch(clearPreview());
        };
    }, [
        dispatch,
        projectUuid,
        agentUuid,
        artifactUuid,
        versionUuid,
        threadUuid,
        promptUuid,
    ]);

    const handleNavigateToVerifiedArtifacts = () => {
        void navigate(
            `/projects/${projectUuid}/ai-agents/${agentUuid}/edit/verified-artifacts`,
        );
    };

    const breadcrumbItems = [
        <Anchor
            key="verified-answers"
            size="lg"
            onClick={handleNavigateToVerifiedArtifacts}
            td="none"
            fw={500}
        >
            Verified Answers
        </Anchor>,
        <Text key="artifact" size="lg" fw={500}>
            {artifactData?.title || 'Artifact'}
        </Text>,
    ];

    return (
        <PanelGroup
            direction="horizontal"
            style={{ height: `calc(100vh - ${NAVBAR_HEIGHT}px)` }}
        >
            <Panel
                id="artifact-preview"
                defaultSize={60}
                minSize={25}
                maxSize={70}
            >
                <Stack gap="sm" mt="lg" pr="md">
                    <Stack gap="xs">
                        <Breadcrumbs separator="/">
                            {breadcrumbItems}
                        </Breadcrumbs>
                        <Text size="sm" c="dimmed">
                            {artifactData?.description ||
                                'View verified answer'}
                        </Text>
                    </Stack>
                    {artifact && (
                        <Box h="800px" pos="relative" bg="white">
                            <AiArtifactPanel
                                artifact={artifact}
                                showCloseButton={true}
                            />
                        </Box>
                    )}
                </Stack>
            </Panel>
        </PanelGroup>
    );
};
