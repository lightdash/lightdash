import { Button, Code, Stack, Text } from '@mantine-8/core';
import { IconTableShortcut } from '@tabler/icons-react';
import type { FC, MouseEvent } from 'react';
import MantineIcon from '../../../../../../../components/common/MantineIcon';
import { useCreateAiAgentSqlChartArtifact } from '../../../../hooks/useProjectAiAgents';
import {
    setArtifact,
    type ArtifactData,
} from '../../../../store/aiArtifactSlice';
import { useAiAgentStoreDispatch } from '../../../../store/hooks';
import type { ToolCallArtifactContext } from '../utils/types';

type SqlRunToolCallDescriptionProps = {
    sql: string;
    limit?: number;
    title?: string;
    description?: string;
    artifactContext?: ToolCallArtifactContext;
    isSuccessful?: boolean;
};

const CreateSqlChartButton: FC<{
    sql: string;
    limit?: number;
    title?: string;
    description?: string;
    artifactContext: ToolCallArtifactContext;
}> = ({ sql, limit, title, description, artifactContext }) => {
    const dispatch = useAiAgentStoreDispatch();
    const createArtifact = useCreateAiAgentSqlChartArtifact(artifactContext);

    const openArtifact = (
        artifact: Pick<ArtifactData, 'artifactUuid' | 'versionUuid'>,
    ) => {
        dispatch(
            setArtifact({
                projectUuid: artifactContext.projectUuid,
                agentUuid: artifactContext.agentUuid,
                threadUuid: artifactContext.threadUuid,
                messageUuid: artifactContext.messageUuid,
                artifactUuid: artifact.artifactUuid,
                versionUuid: artifact.versionUuid,
            }),
        );
    };

    const handleCreate = async (event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();

        const artifact = await createArtifact.mutateAsync({
            sql,
            limit,
            title,
            description,
        });
        openArtifact(artifact);
    };

    return (
        <Button
            size="compact-xs"
            variant="light"
            color="gray"
            loading={createArtifact.isLoading}
            leftSection={<MantineIcon icon={IconTableShortcut} size={12} />}
            onClick={handleCreate}
        >
            Create SQL chart
        </Button>
    );
};

export const SqlRunToolCallDescription: FC<SqlRunToolCallDescriptionProps> = ({
    sql,
    limit,
    title,
    description,
    artifactContext,
    isSuccessful = false,
}) => {
    return (
        <Stack gap={6} align="flex-start">
            {limit ? (
                <Text c="dimmed" size="xs">
                    Row limit: {limit}
                </Text>
            ) : null}
            <Code
                block
                style={{ fontSize: 11, maxHeight: 200, overflow: 'auto' }}
            >
                {sql}
            </Code>
            {isSuccessful && artifactContext ? (
                <CreateSqlChartButton
                    sql={sql}
                    limit={limit}
                    title={title}
                    description={description}
                    artifactContext={artifactContext}
                />
            ) : null}
        </Stack>
    );
};
