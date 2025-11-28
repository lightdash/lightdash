import {
    capitalize,
    getErrorMessage,
    NotImplementedError,
    type AdditionalMetric,
    type CustomDimension,
} from '@lightdash/common';
import {
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
import { IconGitBranch, IconInfoCircle } from '@tabler/icons-react';
import * as yaml from 'js-yaml';
import { memo, useMemo, useState } from 'react';
import { useParams } from 'react-router';

import {
    explorerActions,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import CollapsableCard from '../../common/CollapsableCard/CollapsableCard';
import MantineIcon from '../../common/MantineIcon';
import { CreatedPullRequestModalContent } from './CreatedPullRequestModalContent';
import {
    useIsGitProject,
    useWriteBackCustomDimensions,
    useWriteBackCustomMetrics,
} from './hooks';
import { convertToDbt, getItemId, getItemLabel, match } from './utils';

const prDisabledMessage =
    'Pull requests can only be opened for Git connected projects (GitHub/GitLab)';
const texts = {
    customDimension: {
        name: 'custom dimension',
        baseName: 'dimension',
        prDisabled: prDisabledMessage,
    },
    customMetric: {
        name: 'custom metric',
        baseName: 'metric',
        prDisabled: prDisabledMessage,
    },
} as const;

const parseError = (
    error: unknown,
    type: 'customDimension' | 'customMetric',
): string => {
    const errorName = error instanceof Error ? error.name : 'unknown error';
    const errorTitle =
        error instanceof NotImplementedError
            ? `Unsupported ${texts[type].baseName} definition`
            : errorName;
    return `Error: ${errorTitle}\n${getErrorMessage(error)}`;
};

export const SingleItemModalContent = ({
    handleClose,
    item,
    projectUuid,
}: {
    handleClose: () => void;
    projectUuid: string;
    item: CustomDimension | AdditionalMetric;
}) => {
    const type = match(
        item,
        () => 'customDimension' as const,
        () => 'customMetric' as const,
    );

    const {
        mutate: writeBackCustomDimension,
        data: writeBackCustomDimensionData,
        isLoading: writeBackCustomDimensionIsLoading,
    } = useWriteBackCustomDimensions(projectUuid!);
    const {
        mutate: writeBackCustomMetrics,
        data: writeBackCustomMetricsData,
        isLoading: writeBackCustomMetricsIsLoading,
    } = useWriteBackCustomMetrics(projectUuid!);

    const data = match(
        item,
        () => writeBackCustomDimensionData,
        () => writeBackCustomMetricsData,
    );

    const isLoading = match(
        item,
        () => writeBackCustomDimensionIsLoading,
        () => writeBackCustomMetricsIsLoading,
    );

    const [showDiff, setShowDiff] = useState(true);
    const [error, setError] = useState<string | undefined>();

    const isGitProject = useIsGitProject(projectUuid);

    const previewCode = useMemo(() => {
        try {
            const { key, value } = convertToDbt(item);

            const code = yaml.dump({
                [key]: value,
            });

            setError(undefined);
            return code;
        } catch (e) {
            setError(parseError(e, type));
            return '';
        }
    }, [item, type]);

    if (data) {
        // Return a simple confirmation modal with the PR URL
        return (
            <CreatedPullRequestModalContent data={data} onClose={handleClose} />
        );
    }

    const disableErrorTooltip = isGitProject && !error;

    const errorTooltipLabel = error
        ? `Unsupported ${texts[type].baseName} definition`
        : prDisabledMessage;

    const buttonDisabled = isLoading || !disableErrorTooltip;

    const itemLabel = getItemLabel(item);

    return (
        <Modal
            size="lg"
            onClick={(e) => e.stopPropagation()}
            opened={true}
            onClose={handleClose}
            title={
                <Group spacing="xs">
                    <MantineIcon
                        icon={IconGitBranch}
                        size="lg"
                        color="ldGray.7"
                    />
                    <Text fw={500}>Write back to dbt</Text>
                    <Tooltip
                        variant="xs"
                        withinPortal
                        multiline
                        maw={300}
                        label={`Convert this ${texts[type].name} into a ${texts[type].baseName} in your dbt project. This will create a new branch and open a pull request.`}
                    >
                        <MantineIcon
                            color="ldGray.7"
                            icon={IconInfoCircle}
                            size={16}
                        />
                    </Tooltip>
                </Group>
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.ldGray[4]}` },
                body: { padding: 0 },
            })}
        >
            <Stack p="md">
                <Text>
                    Create a pull request in your dbt project's git repository
                    for the following {texts[type].name}:
                </Text>
                <List spacing="xs" pl="xs">
                    <List.Item fz="xs" ff="monospace">
                        {itemLabel}
                    </List.Item>
                </List>
                <CollapsableCard
                    isOpen={showDiff}
                    title={`Show ${texts[type].baseName} code`}
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
                    color="ldGray.7"
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
                                match(
                                    item,
                                    (customDimension) =>
                                        writeBackCustomDimension([
                                            customDimension,
                                        ]),
                                    (customMetric) =>
                                        writeBackCustomMetrics([customMetric]),
                                );
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

const MultipleItemsModalContent = ({
    handleClose,
    items,
    projectUuid,
}: {
    handleClose: () => void;
    projectUuid: string;
    items: CustomDimension[] | AdditionalMetric[];
}) => {
    const type = match(
        items[0]!,
        () => 'customDimension' as const,
        () => 'customMetric' as const,
    );

    const {
        mutate: writeBackCustomDimension,
        data: writeBackCustomDimensionData,
        isLoading: writeBackCustomDimensionIsLoading,
    } = useWriteBackCustomDimensions(projectUuid!);
    const {
        mutate: writeBackCustomMetrics,
        data: writeBackCustomMetricsData,
        isLoading: writeBackCustomMetricsIsLoading,
    } = useWriteBackCustomMetrics(projectUuid!);

    const data = match(
        items[0]!,
        () => writeBackCustomDimensionData,
        () => writeBackCustomMetricsData,
    );

    const isLoading = match(
        items[0]!,
        () => writeBackCustomDimensionIsLoading,
        () => writeBackCustomMetricsIsLoading,
    );

    const isGitProject = useIsGitProject(projectUuid);

    const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

    const selectedItems = useMemo(
        () => items.filter((item) => selectedItemIds.includes(getItemId(item))),
        [items, selectedItemIds],
    );

    const [error, setError] = useState<string | undefined>();

    const previewCode = useMemo(() => {
        if (selectedItems.length === 0) return '';
        try {
            const code = yaml.dump(
                selectedItems
                    .map((item) => {
                        const { key, value } = convertToDbt(item);
                        return {
                            [key]: value,
                        };
                    })
                    .reduce((acc, curr) => ({ ...acc, ...curr }), {}),
            );
            setError(undefined);
            return code;
        } catch (e) {
            setError(parseError(e, type));
            return '';
        }
    }, [selectedItems, type]);

    if (data) {
        // Return a simple confirmation modal with the PR URL
        return (
            <CreatedPullRequestModalContent data={data} onClose={handleClose} />
        );
    }

    const disableErrorTooltip =
        isGitProject && selectedItemIds.length > 0 && !error;

    const errorTooltipLabel = error
        ? `Unsupported ${texts[type].baseName} definition`
        : !isGitProject
        ? prDisabledMessage
        : `Select ${texts[type].baseName}s to open a pull request`;

    const buttonDisabled =
        isLoading || !disableErrorTooltip || selectedItemIds.length === 0;
    return (
        <Modal
            size="xl"
            onClick={(e) => e.stopPropagation()}
            opened={true}
            onClose={handleClose}
            title={
                <Group spacing="xs">
                    <MantineIcon
                        icon={IconGitBranch}
                        size="lg"
                        color="ldGray.7"
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
                color="ldGray.7"
                sx={(theme) => ({
                    borderBottom: `1px solid ${theme.colors.ldGray[4]}`,
                })}
            >
                Create a pull request in your dbt project's git repository for
                the following {texts[type].baseName}s
            </Text>

            <Stack p="md">
                <Group align="flex-start" h="305px">
                    <Stack w="30%" h="100%">
                        <Text>
                            Available {texts[type].name}s (
                            {selectedItemIds.length} selected)
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
                            {items.map((item) => {
                                const itemId = getItemId(item);
                                const itemLabel = getItemLabel(item);
                                return (
                                    <Tooltip
                                        label={itemLabel}
                                        key={itemId}
                                        position="right"
                                    >
                                        <Group
                                            noWrap
                                            key={itemId}
                                            onClick={() =>
                                                setSelectedItemIds(
                                                    !selectedItemIds.includes(
                                                        itemId,
                                                    )
                                                        ? [
                                                              ...selectedItemIds,
                                                              itemId,
                                                          ]
                                                        : selectedItemIds.filter(
                                                              (name) =>
                                                                  name !==
                                                                  itemId,
                                                          ),
                                                )
                                            }
                                            sx={{ cursor: 'pointer' }}
                                        >
                                            <Checkbox
                                                size="xs"
                                                checked={selectedItemIds.includes(
                                                    itemId,
                                                )}
                                            />
                                            <Text truncate="end">
                                                {itemLabel}
                                            </Text>
                                        </Group>
                                    </Tooltip>
                                );
                            })}
                        </Stack>
                    </Stack>
                    <Stack w="calc(70% - 18px)" h="100%">
                        <Text>
                            {capitalize(texts[type].baseName)} YAML to be
                            created:
                        </Text>

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
                    color="ldGray.7"
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
                                if (!items || selectedItems.length === 0)
                                    return;

                                match(
                                    items[0],
                                    () =>
                                        writeBackCustomDimension(
                                            selectedItems as CustomDimension[],
                                        ),
                                    () =>
                                        writeBackCustomMetrics(
                                            selectedItems as AdditionalMetric[],
                                        ),
                                );
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

export const WriteBackModal = memo(() => {
    const { isOpen, items } = useExplorerSelector(
        (state) => state.explorer.modals.writeBack,
    );
    const dispatch = useExplorerDispatch();

    const { projectUuid } = useParams<{
        projectUuid: string;
    }>();

    const toggleModal = () => dispatch(explorerActions.toggleWriteBackModal());

    if (!isOpen) {
        return null;
    }

    if (!items || items.length === 0) {
        console.error(new Error('No items to write back'));
        return null; // TODO: Add a modal to explain that no custom metrics or dimensions are defined
    }

    if (items && items.length === 1) {
        return (
            <SingleItemModalContent
                handleClose={toggleModal}
                item={items[0]}
                projectUuid={projectUuid!}
            />
        );
    }

    return (
        <MultipleItemsModalContent
            handleClose={toggleModal}
            projectUuid={projectUuid!}
            items={items}
        />
    );
});
