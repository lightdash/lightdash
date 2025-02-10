import { type AdditionalMetric } from '@lightdash/common';
import {
    Anchor,
    Button,
    Group,
    List,
    Modal,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconBrandGithub, IconInfoCircle } from '@tabler/icons-react';
import { useCallback } from 'react';
import { useParams } from 'react-router';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
import MantineIcon from '../../common/MantineIcon';
import { useWriteBackCustomMetrics } from './hooks/useCustomMetricWriteBack';

const SingleCustomMetricModalContent = ({
    isOpen,
    handleClose,
    data,
    isLoading,
    item,
    writeBackCustomMetrics,
}: {
    isOpen: boolean;
    handleClose: () => void;
    data: any;
    isLoading: boolean;
    item: AdditionalMetric;
    writeBackCustomMetrics: (items: AdditionalMetric[]) => void;
}) => {
    return (
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
                            Create a pull request in your dbt project's GitHub
                            repository for the following metric:
                        </Text>
                        <List spacing="xs" pl="xs">
                            <List.Item fz="xs" ff="monospace">
                                {item.label}
                            </List.Item>
                        </List>
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
    isOpen,
    handleClose,
    data,
    isLoading,
    items,
    writeBackCustomMetrics,
}: {
    isOpen: boolean;
    handleClose: () => void;
    data: any;
    isLoading: boolean;
    items: AdditionalMetric[];
    writeBackCustomMetrics: (items: AdditionalMetric[]) => void;
}) => {
    return (
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
            <p>Multiple</p>

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
                                if (!items) return;
                                writeBackCustomMetrics(items);
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

export const CustomMetricWriteBackModal = () => {
    const { isOpen, items, multiple } = useExplorerContext(
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

    const handleClose = useCallback(() => {
        toggleModal();
        reset();
    }, [toggleModal, reset]);

    if (items && !multiple && items.length === 1) {
        return (
            <SingleCustomMetricModalContent
                isOpen={isOpen}
                handleClose={handleClose}
                data={data}
                isLoading={isLoading}
                item={items[0]}
                writeBackCustomMetrics={writeBackCustomMetrics}
            />
        );
    } else if (multiple === true) {
        return (
            <MultipleCustomMetricModalContent
                isOpen={isOpen}
                handleClose={handleClose}
                data={data}
                isLoading={isLoading}
                items={items || []}
                writeBackCustomMetrics={writeBackCustomMetrics}
            />
        );
    }
};
