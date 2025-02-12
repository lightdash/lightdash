import { type AdditionalMetric } from '@lightdash/common';
import {
    Anchor,
    Button,
    Checkbox,
    Group,
    List,
    Loader,
    Modal,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { Prism } from '@mantine/prism';
import { IconBrandGithub, IconInfoCircle } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
import CollapsableCard from '../../common/CollapsableCard/CollapsableCard';
import MantineIcon from '../../common/MantineIcon';
import { useWriteBackCustomMetrics } from './hooks/useCustomMetricWriteBack';
import { usePreviewWriteBackCustomMetrics } from './hooks/usePreviewCustomMetricWriteBack';

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
    const {
        mutate: previewWriteBackCustomMetrics,
        data: previewData,
        isLoading: previewLoading,
    } = usePreviewWriteBackCustomMetrics(projectUuid!);
    const [showDiff, setShowDiff] = useState(false);

    useEffect(() => {
        if (item) {
            previewWriteBackCustomMetrics([item]);
        }
    }, [item, previewWriteBackCustomMetrics]);

    if (data) {
        // Return a simple confirmation modal with the PR URL
        return (
            <CreatedPullRequestModalContent data={data} onClose={handleClose} />
        );
    }

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
                    {previewLoading ? (
                        <Loader size="lg" color="gray" mt="xs" />
                    ) : (
                        <Stack ml={36}>
                            {previewData?.files?.map((file) => (
                                <>
                                    <Group>
                                        <Text>File:</Text>
                                        <Text fw={600} key={file.file}>
                                            {file.file}
                                        </Text>
                                    </Group>
                                    {file.diff.map((diff) => (
                                        <Prism
                                            language="yaml"
                                            withLineNumbers
                                            trim={false}
                                            key={diff.value}
                                            // all lines are additions, no need to highlight
                                        >
                                            {diff.value}
                                        </Prism>
                                    ))}
                                </>
                            ))}
                        </Stack>
                    )}
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

                <Button
                    disabled={isLoading}
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
    } = useWriteBackCustomMetrics(projectUuid!);
    const {
        mutate: previewWriteBackCustomMetrics,
        data: previewData,
        isLoading: previewLoading,
    } = usePreviewWriteBackCustomMetrics(projectUuid!);

    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    useEffect(() => {
        if (selectedItems.length > 0) {
            previewWriteBackCustomMetrics(
                items.filter((item) => selectedItems.includes(item.name)),
            );
        }
    }, [items, selectedItems, previewWriteBackCustomMetrics]);

    const previewCode = useMemo(() => {
        if (!previewData || selectedItems.length === 0) return '';

        const allLines = previewData.files
            .flatMap((file) => file.diff.map((diff) => diff.value.split('\n')))
            .flat();

        const minIndentation: string = allLines.reduce<string>((acc, line) => {
            if (line.trim() === '') return acc;
            const indent = line.match(/^\s*/)?.[0] || '';

            return indent.length < acc.length ? indent : acc;
        }, allLines[0].match(/^\s*/)?.[0] || '');
        return allLines
            .map((line) => line.replace(minIndentation, ''))
            .join('\n');
    }, [selectedItems, previewData]);

    if (data) {
        // Return a simple confirmation modal with the PR URL
        return (
            <CreatedPullRequestModalContent data={data} onClose={handleClose} />
        );
    }

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
                body: { padding: 0, height: '400px' },
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
                <Group grow align="flex-start">
                    <Text>
                        Available metrics ({selectedItems.length} selected)
                    </Text>
                    <Text>Metric YAML to be created:</Text>
                </Group>

                <Group grow align="flex-start" h="235px">
                    <Stack
                        h="100%"
                        p="sm"
                        sx={{
                            border: '1px solid #e0e0e0',
                            borderRadius: '4px',
                            overflowY: 'auto',
                            flex: 0.5,
                        }}
                    >
                        {items.map((item) => (
                            <Group key={item.name}>
                                <Checkbox
                                    size="xs"
                                    checked={selectedItems.includes(item.name)}
                                    onChange={(e) =>
                                        setSelectedItems(
                                            e.target.checked
                                                ? [...selectedItems, item.name]
                                                : selectedItems.filter(
                                                      (name) =>
                                                          name !== item.name,
                                                  ),
                                        )
                                    }
                                />
                                <Text>{item.label}</Text>
                            </Group>
                        ))}
                    </Stack>
                    <Stack
                        h="100%"
                        sx={{
                            overflowY: 'auto',
                            flex: 0.5,
                            border: '1px solid #e0e0e0',
                            borderRadius: '4px',
                        }}
                    >
                        {previewLoading ? (
                            <Loader
                                size="lg"
                                color="gray"
                                mt="xs"
                                style={{ margin: 'auto' }}
                            />
                        ) : (
                            <Prism
                                language="yaml"
                                trim={false}
                                noCopy={previewCode === ''}
                                // all lines are additions, no need to highlight
                            >
                                {previewCode}
                            </Prism>
                        )}
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
                    label="Select metrics to open a pull request"
                    disabled={selectedItems.length > 0}
                >
                    <div>
                        {' '}
                        <Button
                            disabled={isLoading || selectedItems.length === 0}
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
    const { items, multiple } = useExplorerContext(
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
