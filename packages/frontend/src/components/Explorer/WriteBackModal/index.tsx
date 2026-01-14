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
    Paper,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { Prism } from '@mantine/prism';
import { IconGitBranch } from '@tabler/icons-react';
import * as yaml from 'js-yaml';
import { memo, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import {
    explorerActions,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import CollapsableCard from '../../common/CollapsableCard/CollapsableCard';
import MantineModal from '../../common/MantineModal';
import { PolymorphicGroupButton } from '../../common/PolymorphicGroupButton';
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
        <MantineModal
            size="xl"
            opened={true}
            onClose={handleClose}
            title="Write back to dbt"
            icon={IconGitBranch}
            description={`Convert this ${texts[type].name} into a ${texts[type].baseName} in your dbt project. This will create a new branch and open a pull request.`}
            actions={
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
            }
        >
            <Stack>
                <Text fz="sm">
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
        </MantineModal>
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
        <MantineModal
            size="auto"
            opened={true}
            onClose={handleClose}
            title="Write back to dbt"
            icon={IconGitBranch}
            description={`Create a pull request in your dbt project's git repository for the following ${texts[type].baseName}s`}
            actions={
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
            }
        >
            <Group align="flex-start" h="305px">
                <Stack w="30%" h="100%">
                    <Text>
                        Available {texts[type].name}s ({selectedItemIds.length}{' '}
                        selected)
                    </Text>

                    <Stack
                        h="100%"
                        p="sm"
                        style={{
                            border: '1px solid var(--mantine-color-ldGray-3)',
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
                                    <PolymorphicGroupButton
                                        wrap="nowrap"
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
                                                              name !== itemId,
                                                      ),
                                            )
                                        }
                                    >
                                        <Checkbox
                                            size="xs"
                                            checked={selectedItemIds.includes(
                                                itemId,
                                            )}
                                        />
                                        <Text truncate="end">{itemLabel}</Text>
                                    </PolymorphicGroupButton>
                                </Tooltip>
                            );
                        })}
                    </Stack>
                </Stack>
                <Stack w="calc(70% - 18px)" h="100%">
                    <Text>
                        {capitalize(texts[type].baseName)} YAML to be created:
                    </Text>

                    <Paper
                        h="100%"
                        withBorder
                        style={{
                            overflowY: 'auto',
                        }}
                    >
                        <Prism
                            language="yaml"
                            trim={false}
                            noCopy={previewCode === ''}
                        >
                            {error || previewCode}
                        </Prism>
                    </Paper>
                </Stack>
            </Group>
        </MantineModal>
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
