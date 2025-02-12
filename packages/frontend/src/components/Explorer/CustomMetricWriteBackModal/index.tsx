import {
    type AdditionalMetric,
    type PreviewPullRequest,
} from '@lightdash/common';
import {
    Anchor,
    Button,
    Checkbox,
    Group,
    List,
    Loader,
    type MantineColor,
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

type Highlight = Record<
    string,
    {
        color: MantineColor;
        label?: string;
    }
>;

const getDiffCode = (
    preview: PreviewPullRequest,
): { previewCode: string; highlightLines: Highlight } => {
    const allDiffs = preview.files.map((file) => file.diff).flat();

    const allLines = allDiffs.map((diff) => diff.value.split('\n')).flat();

    const minIndentation: string = allLines.reduce<string>((acc, line) => {
        if (line.trim() === '') return acc;
        const indent = line.match(/^\s*/)?.[0] || '';

        return indent.length < acc.length ? indent : acc;
    }, allLines[0].match(/^\s*/)?.[0] || '');

    const result = allDiffs.reduce<{
        code: string;
        highlight: Highlight;
        lineCount: number;
    }>(
        (acc, diff) => {
            const diffLines = diff.value
                .split('\n')
                .filter((line) => line.trim() !== '') // Remove empty lines
                .map((line) => line.replace(minIndentation, ''));
            acc.code += `${diffLines.join('\n')}\n`;
            for (let i = 0; i < diffLines.length; i++) {
                acc.highlight[acc.lineCount + i + 1] =
                    diff.type === 'added'
                        ? {
                              color: 'green',
                              label: 'Added',
                          }
                        : {
                              color: 'red',
                              label: 'Removed',
                          };
            }
            acc.lineCount += diffLines.length;

            return acc;
        },
        { code: '', highlight: {}, lineCount: 0 },
    );

    return {
        previewCode: result.code,
        highlightLines: result.highlight,
    };
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

    const { previewCode, highlightLines } = useMemo(() => {
        if (!previewData) return { previewCode: '', highlightLines: {} };

        return getDiffCode(previewData);
    }, [previewData]);

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
                {data ? (
                    <>
                        <Text>
                            Your pull request{' '}
                            <Anchor
                                href={data.prUrl}
                                target="_blank"
                                span
                                fw={700}
                            >
                                #{data.prUrl.split('/').pop()}
                            </Anchor>{' '}
                            was successfully created on Github.
                            <Text pt="md">
                                Once it is merged, refresh your dbt connection
                                to see your updated metrics.
                            </Text>
                        </Text>
                    </>
                ) : (
                    <>
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
                                    <Group>
                                        <Text>File:</Text>
                                        <Text fw={600}>
                                            {
                                                // This should only return 1 file, for 1 custom metric
                                                previewData?.files
                                                    .map((file) => file.file)
                                                    .join(', ')
                                            }
                                        </Text>
                                    </Group>
                                    <Prism
                                        language="yaml"
                                        trim={false}
                                        highlightLines={highlightLines}
                                    >
                                        {previewCode}
                                    </Prism>
                                </Stack>
                            )}
                        </CollapsableCard>
                    </>
                )}
            </Stack>

            <Group position="right" w="100%" p="md">
                {data ? (
                    <Button
                        color="gray.7"
                        onClick={handleClose}
                        variant="outline"
                        disabled={isLoading}
                        size="xs"
                    >
                        Close
                    </Button>
                ) : (
                    <>
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
                    </>
                )}
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

    const { previewCode, highlightLines } = useMemo(() => {
        if (!previewData || selectedItems.length === 0)
            return { previewCode: '', highlightLines: {} };

        return getDiffCode(previewData);
    }, [selectedItems, previewData]);
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
                                    highlightLines={highlightLines}
                                >
                                    {previewCode}
                                </Prism>
                            )}
                        </Stack>
                    </Stack>
                </Group>
            </Stack>
            <Group position="right" w="100%" p="md">
                {data ? (
                    <Button
                        color="gray.7"
                        onClick={handleClose}
                        variant="outline"
                        disabled={isLoading}
                        size="xs"
                    >
                        Close
                    </Button>
                ) : (
                    <>
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
                                    disabled={
                                        isLoading || selectedItems.length === 0
                                    }
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
                    </>
                )}
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
