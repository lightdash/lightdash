import {
    Anchor,
    Button,
    Group,
    Modal,
    MultiSelect,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconBrandGithub, IconInfoCircle } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
import MantineIcon from '../../common/MantineIcon';
import { useWriteBackCustomMetrics } from './hooks/useCustomMetricWriteBack';

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

    useEffect(() => {
        setSelectedItems(
            allCustomMetrics?.[0]?.name ? [allCustomMetrics?.[0]?.name] : [],
        );
    }, [allCustomMetrics]);
    const handleClose = useCallback(() => {
        toggleModal();
        reset();
        setSelectedItems([]);
    }, [toggleModal, reset]);

    const availableCustomMetrics = useMemo(
        () =>
            allCustomMetrics?.map((item) => ({
                label: item.label,
                value: item.name,
            })) || [],
        [allCustomMetrics],
    );

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

                            /* onDropdownClose={() => {
                                            handleResetSearch();
                                        }}*/
                        />
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
