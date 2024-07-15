import {
    Box,
    Button,
    Collapse,
    Group,
    Modal,
    Select,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import {
    IconBrandDatabricks,
    IconChevronDown,
    IconChevronUp,
    IconTerminal2,
} from '@tabler/icons-react';
import { useFeatureFlagEnabled } from 'posthog-js/react';
import { memo, useState, type FC } from 'react';
import { Link } from 'react-router-dom';
import { useCompiledSql } from '../../../hooks/useCompiledSql';
import { COLLAPSABLE_CARD_BUTTON_PROPS } from '../../common/CollapsableCard';
import MantineIcon from '../../common/MantineIcon';
import { RenderedSql } from '../../RenderedSql';

interface OpenInSqlRunnerButtonProps {
    projectUuid: string;
}

const OpenInSqlRunnerButton: FC<OpenInSqlRunnerButtonProps> = memo(
    ({ projectUuid }) => {
        const [isOpen, setIsOpen] = useState(false);
        const [isSqlCodeVisible, setIsSqlCodeVisible] = useState(false);
        const isDatabricksIntegrationEnabled = useFeatureFlagEnabled(
            'databricks-notebook-button',
        );
        const { data, isInitialLoading, error } = useCompiledSql();
        const searchParams = new URLSearchParams({
            sql_runner: JSON.stringify({ sql: data ?? '' }),
        });

        if (isDatabricksIntegrationEnabled) {
            return (
                <>
                    {/* <Button
                        {...COLLAPSABLE_CARD_BUTTON_PROPS}
                        component={Link}
                        to={`/projects/${projectUuid}/sqlRunner?${searchParams.toString()}`}
                        leftIcon={
                            <MantineIcon icon={IconTerminal2} color="gray" />
                        }
                        disabled={isInitialLoading || !!error}
                    >
                        Open in SQL Runner
                    </Button> */}
                    <Button
                        {...COLLAPSABLE_CARD_BUTTON_PROPS}
                        onClick={() => setIsOpen(true)}
                        disabled={isInitialLoading || !!error}
                        leftIcon={
                            <MantineIcon
                                color="orange"
                                icon={IconBrandDatabricks}
                            />
                        }
                        variant="outline"
                        color="orange.5"
                    >
                        <Text c="black">Open in Databricks</Text>
                    </Button>
                    <Modal
                        title={
                            <Group spacing="xs">
                                <MantineIcon
                                    size="lg"
                                    color="blue.8"
                                    icon={IconTerminal2}
                                />
                                <Title order={4}>SQL</Title>
                            </Group>
                        }
                        size="lg"
                        opened={isOpen}
                        onClose={() => setIsOpen(false)}
                    >
                        <form>
                            <Box
                                sx={{
                                    overflow: 'auto',
                                    maxHeight: 400,
                                }}
                            >
                                <Stack spacing="lg">
                                    <Stack spacing="xs">
                                        <TextInput
                                            id="name"
                                            size="xs"
                                            placeholder="Notebook name (e.g. Trend analysis)"
                                            label="Name"
                                            required
                                        />

                                        <Select
                                            size="xs"
                                            data={['Marketing', 'FinOps']}
                                            label="Workspace"
                                            defaultValue={'Marketing'}
                                            placeholder="Select workspace"
                                            required
                                        />
                                    </Stack>

                                    <Button
                                        variant="default"
                                        size="xs"
                                        sx={{
                                            alignSelf: 'flex-start',
                                        }}
                                        leftIcon={
                                            <MantineIcon
                                                icon={
                                                    isSqlCodeVisible
                                                        ? IconChevronUp
                                                        : IconChevronDown
                                                }
                                            />
                                        }
                                        onClick={() =>
                                            setIsSqlCodeVisible(
                                                !isSqlCodeVisible,
                                            )
                                        }
                                    >
                                        Show code
                                    </Button>
                                    <Collapse in={isSqlCodeVisible}>
                                        <Box
                                            sx={{
                                                overflow: 'auto',
                                                maxHeight: 400,
                                            }}
                                        >
                                            <RenderedSql />
                                        </Box>
                                    </Collapse>
                                </Stack>
                            </Box>
                            <Group position="right" mt="lg" noWrap>
                                <Group spacing="xs">
                                    <Button
                                        size="xs"
                                        component={Link}
                                        to={`/projects/${projectUuid}/sqlRunner?${searchParams.toString()}`}
                                        leftIcon={
                                            <MantineIcon
                                                icon={IconTerminal2}
                                                color="indigo"
                                            />
                                        }
                                        disabled={isInitialLoading || !!error}
                                        variant="outline"
                                        color="indigo"
                                    >
                                        Open in SQL Runner
                                    </Button>

                                    <Button
                                        size="xs"
                                        type="submit"
                                        leftIcon={
                                            <MantineIcon
                                                icon={IconBrandDatabricks}
                                                color="white"
                                            />
                                        }
                                        color="orange.5"
                                    >
                                        Create Databricks notebook
                                    </Button>
                                </Group>
                            </Group>
                        </form>
                    </Modal>
                </>
            );
        }

        return (
            <Button
                {...COLLAPSABLE_CARD_BUTTON_PROPS}
                component={Link}
                to={`/projects/${projectUuid}/sqlRunner?${searchParams.toString()}`}
                leftIcon={<MantineIcon icon={IconTerminal2} color="gray" />}
                disabled={isInitialLoading || !!error}
            >
                Open in SQL Runner
            </Button>
        );
    },
);

export default OpenInSqlRunnerButton;
