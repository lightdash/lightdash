import {
    Anchor,
    Button,
    Group,
    Loader,
    Modal,
    MultiSelect,
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

export const CustomMetricWriteBackModal = () => {
    const { isOpen, items: allCustomMetrics } = useExplorerContext(
        (context) => context.state.modals.additionalMetricWriteBack,
    );
    const { projectUuid } = useParams<{
        projectUuid: string;
    }>();

    const toggleModal = useExplorerContext(
        (context) => context.actions.toggleAdditionalMetricWriteBackModal,
    );

    const {
        mutate: writeBackCustomMetrics,
        data,
        isLoading,
        reset,
    } = useWriteBackCustomMetrics(projectUuid!);
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [showDiff, setShowDiff] = useState(false);

    useEffect(() => {
        setSelectedItems(
            allCustomMetrics?.[0]?.name ? [allCustomMetrics?.[0]?.name] : [],
        );
    }, [allCustomMetrics]);
    const handleClose = useCallback(() => {
        toggleModal();
        reset();
        setSelectedItems([]);
        setShowDiff(false);
    }, [toggleModal, reset]);

    const availableCustomMetrics = useMemo(
        () =>
            allCustomMetrics?.map((item) => ({
                label: item.label,
                value: item.name,
            })) || [],
        [allCustomMetrics],
    );

    const {
        mutate: previewWriteBackCustomMetrics,
        data: previewData,
        isLoading: previewLoading,
    } = usePreviewWriteBackCustomMetrics(projectUuid!);

    useEffect(() => {
        if (selectedItems?.length > 0) {
            const selectedCustomMetrics =
                allCustomMetrics?.filter((item) =>
                    selectedItems.includes(item.name),
                ) || [];
            previewWriteBackCustomMetrics(selectedCustomMetrics);
        }
    }, [selectedItems, allCustomMetrics, previewWriteBackCustomMetrics]);

    return availableCustomMetrics && availableCustomMetrics.length > 0 ? (
        <Modal
            size="lg"
            onClick={(e) => e.stopPropagation()}
            opened={isOpen}
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
                            Create a pull request in your dbt project’s GitHub
                            repository for the following metrics:
                        </Text>
                        <MultiSelect
                            withinPortal
                            required
                            data={availableCustomMetrics}
                            disabled={availableCustomMetrics.length === 0}
                            value={selectedItems}
                            placeholder="Select a custom metric to write back to dbt"
                            searchable
                            clearSearchOnChange={false}
                            itemComponent={({ label, ...others }) => (
                                <Text color="dimmed" {...others}>
                                    {label}
                                </Text>
                            )}
                            onChange={setSelectedItems}
                        />

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
                                if (selectedItems?.length === 0) return;
                                writeBackCustomMetrics(
                                    allCustomMetrics?.filter((item) =>
                                        selectedItems.includes(item.name),
                                    ) || [],
                                );
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
    ) : null;
};
