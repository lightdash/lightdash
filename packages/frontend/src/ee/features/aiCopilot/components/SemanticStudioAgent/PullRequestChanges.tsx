import {
    Anchor,
    Button,
    Center,
    Group,
    Loader,
    Stack,
    Text,
} from '@mantine/core';
import { IconExternalLink, IconFileCode, IconTable } from '@tabler/icons-react';
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

const plural = (count: number, word: string) =>
    `${count} ${word}${count === 1 ? '' : 's'}`;

const LineCounts: FC<{ files: DiffFile[] }> = ({ files }) => (
    <span className={classes.lineCounts}>
        <span data-sign="add">
            +{files.reduce((sum, { additions }) => sum + additions, 0)}
        </span>
        <span data-sign="del">
            −{files.reduce((sum, { deletions }) => sum + deletions, 0)}
        </span>
    </span>
);

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
    const pullRequestNumber = /\/(\d+)\/?$/.exec(prUrl)?.[1];
    return (
        <DiffWorkers>
            <>
                <div className={classes.summary}>
                    <span>{plural(changedModels.length, 'model')}</span>
                    <span className={classes.summaryDot} />
                    <span>{plural(files.length, 'file')}</span>
                    <span className={classes.summaryDot} />
                    <LineCounts files={files} />
                    <Anchor
                        href={prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={classes.summaryLink}
                    >
                        {pullRequestNumber
                            ? `Pull request #${pullRequestNumber}`
                            : 'Pull request'}
                        <MantineIcon icon={IconExternalLink} size={12} />
                    </Anchor>
                </div>
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
                                <Button
                                    size="compact-xs"
                                    variant="default"
                                    ml="auto"
                                    onClick={() =>
                                        tryInExplore(model, previewProjectUuid)
                                    }
                                >
                                    Try in Explore
                                </Button>
                            </Group>
                            <Stack gap="sm" className={classes.modelBody}>
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
                                {modelFiles.map((file) => (
                                    <FileDiff
                                        key={file.key}
                                        patch={file.patch}
                                    />
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
                                <FileDiff key={file.key} patch={file.patch} />
                            ))}
                        </Stack>
                    </section>
                ) : null}
            </>
        </DiffWorkers>
    );
};
