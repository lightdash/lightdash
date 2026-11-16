import { Center, Group, Loader, Stack, Text } from '@mantine/core';
import { IconFile, IconFileCode, IconTable } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import {
    ModelFieldChanges,
    PullRequestUsage,
} from '../../../../../features/semanticStudio/ModelFieldChanges';
import { useWholePullRequestDiff } from '../../hooks/usePullRequestDiff';
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

const LineCounts: FC<{ files: DiffFile[] }> = ({ files }) => {
    const additions = files.reduce((sum, file) => sum + file.additions, 0);
    const deletions = files.reduce((sum, file) => sum + file.deletions, 0);
    return (
        <span className={classes.lineCounts}>
            {additions > 0 ? <span data-sign="add">+{additions}</span> : null}
            {deletions > 0 ? <span data-sign="del">−{deletions}</span> : null}
        </span>
    );
};

const FileBlock: FC<{ file: DiffFile }> = ({ file }) => (
    <div className={classes.fileBlock}>
        <span className={classes.fileName}>
            <MantineIcon icon={IconFile} size={14} />
            {file.path}
        </span>
        <FileDiff patch={file.patch} />
    </div>
);

/** Everything a dbt pull request changes, one model after another: what it does to the model's fields, then the code. */
export const PullRequestChanges: FC<{
    projectUuid: string;
    pullRequest: StudioPullRequest;
}> = ({ projectUuid, pullRequest }) => {
    const { prUrl, commitSha, changedModels, previewProjectUuid } = pullRequest;
    const { data, isInitialLoading, isError } = useWholePullRequestDiff(
        projectUuid,
        prUrl,
        commitSha,
    );
    // A save moves the head: what each model now is gets read again, in place.
    const queryClient = useQueryClient();
    const seenSha = useRef(commitSha);
    useEffect(() => {
        if (seenSha.current === commitSha) return;
        seenSha.current = commitSha;
        void queryClient.invalidateQueries({
            queryKey: ['semantic-studio-model-version', projectUuid],
        });
    }, [commitSha, projectUuid, queryClient]);
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
                {changedModels.map((model) => {
                    const modelFiles = files.filter(
                        (file) => getModelOfFile(file) === model,
                    );
                    return (
                        <section
                            key={model}
                            className={`${classes.modelCard} ${classes.arrives}`}
                        >
                            <Group
                                gap="sm"
                                wrap="nowrap"
                                className={classes.modelHead}
                            >
                                <span className={classes.modelTile}>
                                    <MantineIcon icon={IconTable} size={16} />
                                </span>
                                <Text
                                    component="h3"
                                    className={classes.modelName}
                                >
                                    {model}
                                </Text>
                                <LineCounts files={modelFiles} />
                            </Group>
                            <Stack gap="sm" className={classes.modelBody}>
                                <ModelFieldChanges
                                    projectUuid={projectUuid}
                                    model={model}
                                    previewProjectUuid={previewProjectUuid}
                                    cacheKey={commitSha ?? prUrl}
                                />
                                {modelFiles.map((file) => (
                                    <FileBlock key={file.key} file={file} />
                                ))}
                            </Stack>
                        </section>
                    );
                })}
                <PullRequestUsage
                    projectUuid={projectUuid}
                    models={changedModels}
                    previewProjectUuid={previewProjectUuid}
                />
                {others.length > 0 ? (
                    <section
                        className={`${classes.modelCard} ${classes.arrives}`}
                    >
                        <Group
                            gap="sm"
                            wrap="nowrap"
                            className={classes.modelHead}
                        >
                            <span className={classes.modelTile}>
                                <MantineIcon icon={IconFileCode} size={16} />
                            </span>
                            <Text component="h3" className={classes.modelName}>
                                {changedModels.length > 0
                                    ? 'Other files'
                                    : 'Files'}
                            </Text>
                            <LineCounts files={others} />
                        </Group>
                        <Stack gap="sm" className={classes.modelBody}>
                            {others.map((file) => (
                                <FileBlock key={file.key} file={file} />
                            ))}
                        </Stack>
                    </section>
                ) : null}
            </>
        </DiffWorkers>
    );
};
