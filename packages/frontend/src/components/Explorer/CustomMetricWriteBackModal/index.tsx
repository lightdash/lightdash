import {
    convertCustomMetricToDbt,
    DbtProjectType,
    getErrorMessage,
    NotImplementedError,
    type AdditionalMetric,
} from '@lightdash/common';
import {
    Anchor,
    Button,
    Checkbox,
    Group,
    List,
    Modal,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { Prism } from '@mantine/prism';
import { IconBrandGithub, IconInfoCircle } from '@tabler/icons-react';
import * as yaml from 'js-yaml';
import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { useProject } from '../../../hooks/useProject';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
import CollapsableCard from '../../common/CollapsableCard/CollapsableCard';
import MantineIcon from '../../common/MantineIcon';
import { useWriteBackCustomMetrics } from './hooks/useCustomMetricWriteBack';

const useIsGithubProject = (projectUuid: string) => {
    const { data: project } = useProject(projectUuid);
    return project?.dbtConnection.type === DbtProjectType.GITHUB;
};

const prDisabledMessage =
    'Pull requests can only be opened for GitHub connected projects';
const unsupportedMetricDefinitionError = 'Unsupported metric definition';

const CreatedPullRequestModalContent = ({
    onClose,
    data,
}: {
    onClose: () => void;
    data: { prUrl: string };
}) => {
    return (
        <Modal
            size="xl"
            onClick={(e) => e.stopPropagation()}
            opened={true}
            onClose={onClose}
            title={
                <Group spacing="xs">
                    <MantineIcon
                        icon={IconBrandGithub}
                        size="lg"
                        color="gray.7"
                    />
                    <Text fw={500}>Write back to dbt</Text>
                </Group>
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            })}
        >
            <Stack p="md">
                <Text>
                    Your pull request{' '}
                    <Anchor href={data.prUrl} target="_blank" span fw={700}>
                        #{data.prUrl.split('/').pop()}
                    </Anchor>{' '}
                    was successfully created on Github.
                    <Text pt="md">
                        Once it is merged, refresh your dbt connection to see
                        your updated metrics.
                    </Text>
                </Text>
            </Stack>
            <Group position="right" w="100%" p="md">
                <Button
                    color="gray.7"
                    onClick={onClose}
                    variant="outline"
                    size="xs"
                >
                    Close
                </Button>
            </Group>
        </Modal>
    );
};

const parseError = (error: unknown): string => {
    const errorName = error instanceof Error ? error.name : 'unknown error';
    return `Error: ${
        error instanceof NotImplementedError
            ? `unsupported metric definition`
            : errorName
    }

${getErrorMessage(error)}`;
};

const SingleCustomMetricModalContent = ({
    handleClose,
    item,
    projectUuid,
}: {
    handleClose: () => void;
    projectUuid: string;
    item: AdditionalMetric;
}) => {
    const {
        mutate: writeBackCustomMetrics,
        data,
        isLoading,
    } = useWriteBackCustomMetrics(projectUuid!);
    const [showDiff, setShowDiff] = useState(true);
    const [error, setError] = useState<string | undefined>();

    const isGithubProject = useIsGithubProject(projectUuid);

    const previewCode = useMemo(() => {
        try {
            const code = yaml.dump({
                [item.name]: convertCustomMetricToDbt(item),
            });
            setError(undefined);
            return code;
        } catch (e) {
            setError(parseError(e));
            return '';
        }
    }, [item]);

    if (data) {
        // Return a simple confirmation modal with the PR URL
        return (
            <CreatedPullRequestModalContent data={data} onClose={handleClose} />
        );
    }

    const disableErrorTooltip = isGithubProject && !error;

    const errorTooltipLabel = error
        ? unsupportedMetricDefinitionError
        : prDisabledMessage;

    const buttonDisabled = isLoading || !disableErrorTooltip;

    return (
        <Modal
            size="lg"
            onClick={(e) => e.stopPropagation()}
            opened={true}
            onClose={handleClose}
            title={
                <Group spacing="xs">
                    <MantineIcon
                        icon={IconBrandGithub}
                        size="lg"
                        color="gray.7"
                    />
                    <Text fw={500}>Write back to dbt</Text>
                    <Tooltip
                        variant="xs"
                        withinPortal
                        multiline
                        maw={300}
                        label="Convert this custom metric into a metric in your dbt project. This will create a new branch and start a pull request."
                    >
                        <MantineIcon
                            color="gray.7"
                            icon={IconInfoCircle}
                            size={16}
                        />
                    </Tooltip>
                </Group>
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            })}
        >
            <Stack p="md">
                <Text>
                    Create a pull request in your dbt project's GitHub
                    repository for the following metric:
                </Text>
                <List spacing="xs" pl="xs">
                    <List.Item fz="xs" ff="monospace">
                        {item.label}
                    </List.Item>
                </List>
                <CollapsableCard
                    isOpen={showDiff}
                    title={'Show metrics code'}
                    onToggle={() => setShowDiff(!showDiff)}
                >
                    <Stack ml={36}>
                        <Prism language="yaml" withLineNumbers trim={false}>
                            {error || previewCode}
                        </Prism>
                    </Stack>
                </CollapsableCard>
            </Stack>

            <Group position="right" w="100%" p="md">
                <Button
                    color="gray.7"
                    onClick={handleClose}
                    variant="outline"
                    disabled={isLoading}
                    size="xs"
                >
                    Cancel
                </Button>

                <Tooltip
                    label={errorTooltipLabel}
                    disabled={disableErrorTooltip}
                >
                    <div>
                        <Button
                            disabled={buttonDisabled}
                            size="xs"
                            onClick={() => {
                                if (!item) return;
                                writeBackCustomMetrics([item]);
                            }}
                        >
                            {isLoading
                                ? 'Creating pull request...'
                                : 'Open Pull Request'}
                        </Button>
                    </div>
                </Tooltip>
            </Group>
        </Modal>
    );
};

const MultipleCustomMetricModalContent = ({
    handleClose,
    items,
    projectUuid,
}: {
    handleClose: () => void;
    projectUuid: string;
    items: AdditionalMetric[];
}) => {
    const {
        mutate: writeBackCustomMetrics,
        data,
        isLoading,
    } = useWriteBackCustomMetrics(projectUuid);

    const isGithubProject = useIsGithubProject(projectUuid);

    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [error, setError] = useState<string | undefined>();

    const previewCode = useMemo(() => {
        if (selectedItems.length === 0) return '';
        try {
            const selectedMetrics = items.filter((item) =>
                selectedItems.includes(item.name),
            );
            const code = yaml.dump(
                selectedMetrics.map((item) => ({
                    [item.name]: convertCustomMetricToDbt(item),
                })),
            );
            setError(undefined);
            return code;
        } catch (e) {
            setError(parseError(e));
            return '';
        }
    }, [items, selectedItems]);

    if (data) {
        // Return a simple confirmation modal with the PR URL
        return (
            <CreatedPullRequestModalContent data={data} onClose={handleClose} />
        );
    }

    const disableErrorTooltip =
        isGithubProject && selectedItems.length > 0 && !error;

    const errorTooltipLabel = error
        ? unsupportedMetricDefinitionError
        : !isGithubProject
        ? prDisabledMessage
        : 'Select metrics to open a pull request';

    const buttonDisabled = isLoading || !disableErrorTooltip;

    return (
        <Modal
            size="xl"
            onClick={(e) => e.stopPropagation()}
            opened={true}
            onClose={handleClose}
            title={
                <Group spacing="xs">
                    <MantineIcon
                        icon={IconBrandGithub}
                        size="lg"
                        color="gray.7"
                    />
                    <Text fw={500}>Write back to dbt</Text>
                </Group>
            }
            styles={() => ({
                body: { padding: 0, height: '435px' },
            })}
        >
            <Text
                pl="md"
                pb="sm"
                fz="s"
                color="gray.7"
                sx={(theme) => ({
                    borderBottom: `1px solid ${theme.colors.gray[4]}`,
                })}
            >
                Create a pull request in your dbt project's GitHub repository
                for the following metrics
            </Text>

            <Stack p="md">
                <Group align="flex-start" h="305px">
                    <Stack w="30%" h="100%">
                        <Text>
                            Available metrics ({selectedItems.length} selected)
                        </Text>

                        <Stack
                            h="100%"
                            p="sm"
                            sx={{
                                border: '1px solid #e0e0e0',
                                borderRadius: '4px',
                                overflowY: 'auto',
                            }}
                        >
                            {items.map((item) => (
                                <Tooltip
                                    label={item.label}
                                    key={item.name}
                                    position="right"
                                >
                                    <Group
                                        noWrap
                                        key={item.name}
                                        onClick={() =>
                                            setSelectedItems(
                                                !selectedItems.includes(
                                                    item.name,
                                                )
                                                    ? [
                                                          ...selectedItems,
                                                          item.name,
                                                      ]
                                                    : selectedItems.filter(
                                                          (name) =>
                                                              name !==
                                                              item.name,
                                                      ),
                                            )
                                        }
                                        sx={{ cursor: 'pointer' }}
                                    >
                                        <Checkbox
                                            size="xs"
                                            checked={selectedItems.includes(
                                                item.name,
                                            )}
                                        />
                                        <Text truncate="end">{item.label}</Text>
                                    </Group>
                                </Tooltip>
                            ))}
                        </Stack>
                    </Stack>
                    <Stack w="calc(70% - 18px)" h="100%">
                        <Text>Metric YAML to be created:</Text>

                        <Stack
                            h="100%"
                            sx={{
                                overflowY: 'auto',
                                border: '1px solid #e0e0e0',
                                borderRadius: '4px',
                            }}
                        >
                            <Prism
                                language="yaml"
                                trim={false}
                                noCopy={previewCode === ''}
                            >
                                {error || previewCode}
                            </Prism>
                        </Stack>
                    </Stack>
                </Group>
            </Stack>

            <Group position="right" w="100%" p="md">
                <Button
                    color="gray.7"
                    onClick={handleClose}
                    variant="outline"
                    disabled={isLoading}
                    size="xs"
                >
                    Cancel
                </Button>

                <Tooltip
                    label={errorTooltipLabel}
                    disabled={disableErrorTooltip}
                >
                    <div>
                        <Button
                            disabled={buttonDisabled}
                            size="xs"
                            onClick={() => {
                                if (!items) return;
                                writeBackCustomMetrics(items);
                            }}
                        >
                            {isLoading
                                ? 'Creating pull request...'
                                : 'Open Pull Request'}
                        </Button>
                    </div>
                </Tooltip>
            </Group>
        </Modal>
    );
};

export const CustomMetricWriteBackModal = () => {
    const { items, multiple, isOpen } = useExplorerContext(
        (context) => context.state.modals.additionalMetricWriteBack,
    );
    const { projectUuid } = useParams<{
        projectUuid: string;
    }>();

    const toggleModal = useExplorerContext(
        (context) => context.actions.toggleAdditionalMetricWriteBackModal,
    );

    const handleClose = useCallback(() => {
        toggleModal();
    }, [toggleModal]);

    if (!isOpen) {
        return null;
    }

    if (items && !multiple && items.length === 1) {
        return (
            <SingleCustomMetricModalContent
                handleClose={handleClose}
                item={items[0]}
                projectUuid={projectUuid!}
            />
        );
    } else if (multiple === true) {
        return (
            <MultipleCustomMetricModalContent
                handleClose={handleClose}
                projectUuid={projectUuid!}
                items={items || []}
            />
        );
    } else {
        console.error(
            `Invalid custom metric modal arguments multiple="${multiple}": `,
            items,
        );
    }
};
