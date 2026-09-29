import {
    Anchor,
    Box,
    Code,
    List,
    Stack,
    Tabs,
    Text,
    Title,
} from '@mantine/core';
import { IconPlugConnected } from '@tabler/icons-react';
import { type ReactNode } from 'react';
import CodeBlock from '../../../../../../components/common/CodeBlock/CodeBlock';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { SettingsCard } from '../../../../../../components/common/Settings/SettingsCard';
import useApp from '../../../../../../providers/App/useApp';
import ClaudeIcon from '../../../../../../svgs/anthropic.svg?react';
import ClaudeCodeIcon from '../../../../../../svgs/claude-code.svg?react';
import CursorIcon from '../../../../../../svgs/cursor.svg?react';
import OpenAiIcon from '../../../../../../svgs/openai.svg?react';
import VsCodeIcon from '../../../../../../svgs/vscode.svg?react';
import classes from './McpInstallationCard.module.css';

const LIGHTDASH_MCP_DOCS = 'https://docs.lightdash.com/agents/lightdash-mcp';

type Client = {
    id: string;
    name: string;
    icon: ReactNode;
    docsUrl: string;
    steps: { text: ReactNode; code?: string; language?: string }[];
};

const getClients = (url: string): Client[] => {
    const quotedUrl = `'${url.replaceAll("'", "'\\''")}'`;

    return [
        {
            id: 'claude-desktop',
            name: 'Claude Desktop',
            icon: <ClaudeIcon className={classes.clientIcon} aria-hidden />,
            docsUrl:
                'https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp',
            steps: [
                {
                    text: 'In Claude Desktop, open Customize → Connectors and choose Add custom connector.',
                },
                {
                    text: 'Name it Lightdash and paste this server URL. Remote connectors need a publicly reachable HTTPS URL.',
                    code: url,
                },
                {
                    text: 'Add the connector, then sign in to Lightdash and approve access.',
                },
            ],
        },
        {
            id: 'claude-code',
            name: 'Claude Code',
            icon: <ClaudeCodeIcon className={classes.clientIcon} aria-hidden />,
            docsUrl: 'https://code.claude.com/docs/en/mcp',
            steps: [
                {
                    text: 'Run this command in your terminal.',
                    code: `claude mcp add --transport http lightdash ${quotedUrl}`,
                    language: 'bash',
                },
                {
                    text: (
                        <>
                            In Claude Code, run <Code>/mcp</Code>, select
                            Lightdash, then choose Authenticate.
                        </>
                    ),
                },
                {
                    text: 'Sign in to Lightdash in your browser and approve access.',
                },
            ],
        },
        {
            id: 'codex',
            name: 'Codex',
            icon: <OpenAiIcon className={classes.clientIcon} aria-hidden />,
            docsUrl: 'https://learn.chatgpt.com/docs/extend/mcp?surface=cli',
            steps: [
                {
                    text: 'Add the server and start sign-in from your terminal.',
                    code: `codex mcp add lightdash --url ${quotedUrl}\ncodex mcp login lightdash`,
                    language: 'bash',
                },
                {
                    text: 'Sign in to Lightdash in your browser and approve access.',
                },
                {
                    text: 'Start a new Codex session to use the Lightdash tools.',
                },
            ],
        },
        {
            id: 'cursor',
            name: 'Cursor',
            icon: <CursorIcon className={classes.clientIcon} aria-hidden />,
            docsUrl: 'https://cursor.com/docs/mcp',
            steps: [
                {
                    text: (
                        <>
                            Add this server to your project’s{' '}
                            <Code>.cursor/mcp.json</Code>.
                        </>
                    ),
                    code: JSON.stringify(
                        { mcpServers: { lightdash: { url } } },
                        null,
                        2,
                    ),
                    language: 'json',
                },
                {
                    text: 'Open Cursor Settings → MCP & Integrations and connect Lightdash.',
                },
                {
                    text: 'Sign in to Lightdash in your browser and approve access.',
                },
            ],
        },
        {
            id: 'vscode',
            name: 'VS Code',
            icon: <VsCodeIcon className={classes.vscodeIcon} aria-hidden />,
            docsUrl:
                'https://code.visualstudio.com/docs/agent-customization/mcp-servers',
            steps: [
                {
                    text: (
                        <>
                            Add this server to your project’s{' '}
                            <Code>.vscode/mcp.json</Code>.
                        </>
                    ),
                    code: JSON.stringify(
                        { servers: { lightdash: { type: 'http', url } } },
                        null,
                        2,
                    ),
                    language: 'json',
                },
                {
                    text: (
                        <>
                            Run <Code>MCP: List Servers</Code> from the Command
                            Palette, select Lightdash, and start it.
                        </>
                    ),
                },
                {
                    text: 'Sign in to Lightdash when prompted, then use the tools in Copilot agent mode.',
                },
            ],
        },
        {
            id: 'other',
            name: 'Other clients',
            icon: <MantineIcon icon={IconPlugConnected} size="md" />,
            docsUrl: LIGHTDASH_MCP_DOCS,
            steps: [
                {
                    text: 'Add a remote MCP server and choose Streamable HTTP as the transport.',
                },
                {
                    text: 'Name it Lightdash and paste this server URL.',
                    code: url,
                },
                {
                    text: 'Choose OAuth authentication, sign in to Lightdash, and approve access.',
                },
            ],
        },
    ];
};

export const McpInstallationCard = () => {
    const { health } = useApp();
    const siteUrl = health.data?.siteUrl ?? window.location.origin;
    const mcpUrl = `${siteUrl.replace(/\/+$/, '')}/api/v1/mcp`;
    const clients = getClients(mcpUrl);

    return (
        <SettingsCard p="md">
            <Stack gap="sm">
                <Stack gap={4}>
                    <Title order={5}>Client setup</Title>
                    <Text size="sm" c="dimmed">
                        Connect your AI tools to Lightdash. Choose a client to
                        get started.
                    </Text>
                </Stack>
                <Tabs defaultValue="claude-desktop" keepMounted={false}>
                    <Box className={classes.tabScroller}>
                        <Tabs.List
                            className={classes.tabList}
                            aria-label="MCP clients"
                        >
                            {clients.map((client) => (
                                <Tabs.Tab
                                    key={client.id}
                                    value={client.id}
                                    leftSection={client.icon}
                                >
                                    {client.name}
                                </Tabs.Tab>
                            ))}
                        </Tabs.List>
                    </Box>
                    {clients.map((client) => (
                        <Tabs.Panel key={client.id} value={client.id} pt="sm">
                            <Stack gap="sm">
                                <List
                                    type="ordered"
                                    spacing="xs"
                                    size="sm"
                                    classNames={{
                                        itemWrapper: classes.step,
                                        itemLabel: classes.stepLabel,
                                    }}
                                >
                                    {client.steps.map((step, index) => (
                                        <List.Item key={index}>
                                            <Stack gap="xs">
                                                <Text size="sm">
                                                    {step.text}
                                                </Text>
                                                {step.code && (
                                                    <CodeBlock
                                                        code={step.code}
                                                        language={step.language}
                                                        copyLabel={`Copy ${client.name} configuration`}
                                                    />
                                                )}
                                            </Stack>
                                        </List.Item>
                                    ))}
                                </List>
                                <Stack gap={4}>
                                    <Text size="xs" c="dimmed">
                                        For more details, see the{' '}
                                        <Anchor
                                            href={client.docsUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            size="xs"
                                        >
                                            {client.name} MCP documentation
                                        </Anchor>
                                        .
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                        Connections use your Lightdash
                                        permissions.{' '}
                                        <Anchor
                                            href={LIGHTDASH_MCP_DOCS}
                                            target="_blank"
                                            rel="noreferrer"
                                            size="xs"
                                        >
                                            Read the Lightdash MCP guide
                                        </Anchor>
                                        .
                                    </Text>
                                </Stack>
                            </Stack>
                        </Tabs.Panel>
                    ))}
                </Tabs>
            </Stack>
        </SettingsCard>
    );
};
