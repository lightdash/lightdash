import { subject } from '@casl/ability';
import { formatTimestamp, TimeFrames } from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Badge,
    Box,
    Button,
    Code,
    Flex,
    Group,
    Menu,
    Modal,
    NavLink,
    ScrollArea,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import {
    IconAlertTriangle,
    IconCheck,
    IconCode,
    IconDots,
    IconHistory,
    IconInfoCircle,
} from '@tabler/icons-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { EmptyState } from '../components/common/EmptyState';
import ErrorState from '../components/common/ErrorState';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import {
    useCustomChartJsonHistory,
    useCustomChartJsonRestoreMutation,
    useCustomChartJsonVersion,
    useSavedQuery,
} from '../hooks/useSavedQuery';
import { Can } from '../providers/Ability';
import NoTableIcon from '../svgs/emptystate-no-table.svg?react';

const CustomChartJsonHistory = () => {
    const navigate = useNavigate();
    const { savedQueryUuid, projectUuid } = useParams<{
        savedQueryUuid: string;
        projectUuid: string;
    }>();
    const [selectedVersionUuid, selectVersionUuid] = useState<string>();
    const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);

    const chartQuery = useSavedQuery({
        id: savedQueryUuid,
    });
    const historyQuery = useCustomChartJsonHistory(savedQueryUuid);

    useEffect(() => {
        const currentVersion = historyQuery.data?.history[0];
        if (currentVersion && !selectedVersionUuid) {
            selectVersionUuid(currentVersion.versionUuid);
        }
    }, [selectedVersionUuid, historyQuery.data]);

    const versionQuery = useCustomChartJsonVersion(
        savedQueryUuid,
        selectedVersionUuid,
    );

    const restoreMutation = useCustomChartJsonRestoreMutation(savedQueryUuid, {
        onSuccess: () => {
            void navigate(
                `/projects/${projectUuid}/saved/${savedQueryUuid}/view`,
            );
        },
    });

    if (historyQuery.isInitialLoading || chartQuery.isInitialLoading) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState title="Loading..." loading />
            </div>
        );
    }

    if (historyQuery.error || chartQuery.error) {
        return (
            <ErrorState
                error={historyQuery.error?.error || chartQuery.error?.error}
            />
        );
    }

    if (!chartQuery.data || chartQuery.data.chartKind !== 'custom') {
        return (
            <ErrorState
                error={{
                    statusCode: 400,
                    name: 'Invalid Chart Type',
                    message:
                        'This feature is only available for custom charts.',
                    data: {},
                }}
            />
        );
    }

    const getValidationIcon = (isValid: boolean, validationError?: string) => {
        if (isValid) {
            return <MantineIcon icon={IconCheck} color="green" size="sm" />;
        }
        return (
            <Tooltip label={validationError || 'Invalid JSON'}>
                <MantineIcon icon={IconAlertTriangle} color="red" size="sm" />
            </Tooltip>
        );
    };

    const getValidationBadge = (isValid: boolean) => {
        return (
            <Badge
                size="xs"
                variant="light"
                color={isValid ? 'green' : 'red'}
                leftSection={getValidationIcon(isValid)}
            >
                {isValid ? 'Valid' : 'Invalid'}
            </Badge>
        );
    };

    return (
        <Page
            title="Custom Chart JSON History"
            withSidebarFooter
            withFullHeight
            withPaddedContent
            sidebar={
                <Stack
                    spacing="xl"
                    mah="100%"
                    sx={{ overflowY: 'hidden', flex: 1 }}
                >
                    <Flex gap="xs">
                        <PageBreadcrumbs
                            items={[
                                {
                                    title: 'Chart',
                                    to: `/projects/${projectUuid}/saved/${savedQueryUuid}/view`,
                                },
                                { title: 'JSON History', active: true },
                            ]}
                        />
                    </Flex>
                    <Stack spacing="xs" sx={{ flexGrow: 1, overflowY: 'auto' }}>
                        {historyQuery.data?.history.map((version, index) => (
                            <NavLink
                                key={version.versionUuid}
                                active={
                                    version.versionUuid === selectedVersionUuid
                                }
                                icon={<MantineIcon icon={IconCode} />}
                                label={
                                    <Group position="apart" w="100%">
                                        <Text size="sm">
                                            {formatTimestamp(
                                                version.createdAt,
                                                TimeFrames.SECOND,
                                            )}
                                        </Text>
                                        {getValidationBadge(version.isValid)}
                                    </Group>
                                }
                                description={
                                    <Text size="xs">
                                        Updated by:{' '}
                                        {version.createdBy?.firstName}{' '}
                                        {version.createdBy?.lastName}
                                    </Text>
                                }
                                rightSection={
                                    <>
                                        {index === 0 && (
                                            <Tooltip label="This is the current version.">
                                                <Badge
                                                    size="xs"
                                                    variant="light"
                                                    color="green"
                                                >
                                                    current
                                                </Badge>
                                            </Tooltip>
                                        )}
                                        {index !== 0 &&
                                            version.versionUuid ===
                                                selectedVersionUuid && (
                                                <Can
                                                    I="manage"
                                                    this={subject(
                                                        'SavedChart',
                                                        {
                                                            ...chartQuery.data,
                                                        },
                                                    )}
                                                >
                                                    <Menu
                                                        withinPortal
                                                        position="bottom-start"
                                                        withArrow
                                                        arrowPosition="center"
                                                        shadow="md"
                                                        offset={-4}
                                                        closeOnItemClick
                                                        closeOnClickOutside
                                                    >
                                                        <Menu.Target>
                                                            <ActionIcon
                                                                sx={(
                                                                    theme,
                                                                ) => ({
                                                                    ':hover': {
                                                                        backgroundColor:
                                                                            theme
                                                                                .colors
                                                                                .gray[1],
                                                                    },
                                                                })}
                                                            >
                                                                <IconDots
                                                                    size={16}
                                                                />
                                                            </ActionIcon>
                                                        </Menu.Target>

                                                        <Menu.Dropdown
                                                            maw={320}
                                                        >
                                                            <Menu.Item
                                                                component="button"
                                                                role="menuitem"
                                                                icon={
                                                                    <IconHistory
                                                                        size={
                                                                            18
                                                                        }
                                                                    />
                                                                }
                                                                onClick={() => {
                                                                    setIsRestoreModalOpen(
                                                                        true,
                                                                    );
                                                                }}
                                                            >
                                                                Restore this
                                                                JSON version
                                                            </Menu.Item>
                                                        </Menu.Dropdown>
                                                    </Menu>
                                                </Can>
                                            )}
                                    </>
                                }
                                onClick={() =>
                                    selectVersionUuid(version.versionUuid)
                                }
                            />
                        ))}
                    </Stack>
                    <Alert
                        icon={<MantineIcon icon={IconInfoCircle} size={'md'} />}
                        title="JSON Version History"
                        color="blue"
                        variant="light"
                    >
                        <p>
                            View and restore previous versions of your custom
                            chart JSON specification. Only the JSON
                            configuration is restored, preserving your current
                            chart settings.
                        </p>
                    </Alert>
                </Stack>
            }
        >
            {!selectedVersionUuid && (
                <EmptyState
                    maw={500}
                    icon={<NoTableIcon />}
                    title="Select a JSON version"
                />
            )}
            {versionQuery.data && (
                <Stack spacing="md" h="100%">
                    <Group position="apart">
                        <Title order={4}>Custom Chart JSON Version</Title>
                        <Group spacing="xs">
                            {getValidationBadge(versionQuery.data.isValid)}
                            {versionQuery.data.validationError && (
                                <Text size="sm" color="red">
                                    {versionQuery.data.validationError}
                                </Text>
                            )}
                        </Group>
                    </Group>

                    <Box
                        sx={{
                            border: '1px solid #dee2e6',
                            borderRadius: '4px',
                            padding: '16px',
                            backgroundColor: '#f8f9fa',
                        }}
                    >
                        <ScrollArea h="calc(100vh - 250px)">
                            <Code block style={{ fontSize: '12px' }}>
                                {versionQuery.data.jsonSpec}
                            </Code>
                        </ScrollArea>
                    </Box>
                </Stack>
            )}

            <Modal
                opened={isRestoreModalOpen}
                onClose={() => setIsRestoreModalOpen(false)}
                withCloseButton={false}
                title={
                    <Group spacing="xs">
                        <MantineIcon icon={IconHistory} size="lg" />
                        <Title order={4}>Restore Custom Chart JSON</Title>
                    </Group>
                }
            >
                <Stack>
                    <Text>
                        By restoring this JSON version, a new chart version will
                        be created with the selected JSON specification. Your
                        current chart settings (filters, dimensions, etc.) will
                        be preserved, but the JSON configuration will be
                        replaced.
                    </Text>
                    <Group position="right" spacing="xs">
                        <Button
                            variant="outline"
                            disabled={restoreMutation.isLoading}
                            onClick={() => setIsRestoreModalOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            loading={restoreMutation.isLoading}
                            onClick={() =>
                                selectedVersionUuid &&
                                restoreMutation.mutate(selectedVersionUuid)
                            }
                            type="submit"
                        >
                            Restore JSON
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Page>
    );
};

export default CustomChartJsonHistory;
