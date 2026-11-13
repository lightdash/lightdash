import { Button, Center, Group, Loader, Stack, Text } from '@mantine/core';
import { IconTable } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import {
    ModelFieldChanges,
    ModelTotals,
    PullRequestUsage,
} from '../../../../../features/semanticStudio/ModelFieldChanges';
import { useTryInExplore } from '../../../../../features/semanticStudio/useTryInExplore';
import { usePullRequestDiff } from '../../hooks/usePullRequestDiff';
import {
    splitPatchIntoFiles,
    type DiffFile,
} from '../ChatElements/ToolCalls/splitPatch';
import {
    DiffWorkers,
    FileDiff,
} from '../ChatElements/ToolCalls/WritebackDiffModal';
import classes from './SemanticStudioAgent.module.css';
import { type StudioPullRequest } from './useStudioPullRequest';

/** `models/customers.yml` belongs to the model `customers`. */
const getModelOfFile = ({ path }: DiffFile): string =>
    (path.split('/').pop() ?? path).replace(/\.[^.]+$/, '');

/** Everything a dbt pull request changes, one model after another: what it does to the model's fields, then the code. */
export const PullRequestChanges: FC<{
    projectUuid: string;
    pullRequest: StudioPullRequest;
}> = ({ projectUuid, pullRequest }) => {
    const { prUrl, commitSha, changedModels, previewProjectUuid } = pullRequest;
    const { data, isInitialLoading, isError } = usePullRequestDiff(
        projectUuid,
        prUrl,
        commitSha,
        true,
    );
    const tryInExplore = useTryInExplore(projectUuid);
    const files = useMemo(
        () => (data?.diff ? splitPatchIntoFiles(data.diff) : []),
        [data],
    );
    if (isInitialLoading) {
        return (
            <Center p="xl">
                <Loader size="sm" />
            </Center>
        );
    }
    if (isError || !data?.diff) {
        return (
            <Text size="sm" c="dimmed" ta="center" py="xl">
                Couldn't load the changes of this pull request.
            </Text>
        );
    }
    const others = files.filter(
        (file) => !changedModels.includes(getModelOfFile(file)),
    );
    return (
        <DiffWorkers>
            <>
                {changedModels.map((model) => (
                    <Stack key={model} gap="xs" className={classes.arrives}>
                        <Group gap="xs" wrap="nowrap">
                            <MantineIcon
                                icon={IconTable}
                                size={16}
                                color="dimmed"
                            />
                            <Text component="h3" fz="sm" fw={600} flex={1}>
                                {model}
                            </Text>
                            <Button
                                size="compact-xs"
                                variant="default"
                                onClick={() =>
                                    tryInExplore(model, previewProjectUuid)
                                }
                            >
                                Try in Explore
                            </Button>
                        </Group>
                        <ModelFieldChanges
                            projectUuid={projectUuid}
                            model={model}
                            previewProjectUuid={previewProjectUuid}
                        />
                        <ModelTotals
                            projectUuid={projectUuid}
                            model={model}
                            previewProjectUuid={previewProjectUuid}
                            cacheKey={commitSha ?? prUrl}
                        />
                        {files
                            .filter((file) => getModelOfFile(file) === model)
                            .map((file) => (
                                <FileDiff key={file.key} patch={file.patch} />
                            ))}
                    </Stack>
                ))}
                <PullRequestUsage
                    projectUuid={projectUuid}
                    models={changedModels}
                    previewProjectUuid={previewProjectUuid}
                />
                {others.length > 0 ? (
                    <Stack gap="xs" className={classes.arrives}>
                        <Text component="h3" fz="sm" fw={600}>
                            {changedModels.length > 0 ? 'Other files' : 'Files'}
                        </Text>
                        {others.map((file) => (
                            <FileDiff key={file.key} patch={file.patch} />
                        ))}
                    </Stack>
                ) : null}
            </>
        </DiffWorkers>
    );
};
