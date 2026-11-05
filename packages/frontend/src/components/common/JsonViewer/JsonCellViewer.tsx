import {
    Box,
    Button,
    CopyButton,
    Group,
    Menu,
    ScrollArea,
    Stack,
    Tabs,
    Text,
} from '@mantine/core';
import { IconCheck, IconCode, IconCopy, IconEye } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import CodeBlock from '../CodeBlock/CodeBlock';
import { CopyActionIcon } from '../CopyActionIcon';
import MantineIcon from '../MantineIcon';
import MantineModal from '../MantineModal';
import JsonTree from './JsonTree';
import { type JsonCellValue } from './utils';

type Props = {
    value: JsonCellValue;
};

type ModalProps = Props & {
    opened: boolean;
    onClose: () => void;
};

type MenuItemProps = {
    onClick: () => void;
};

const getJsonPreview = (value: JsonCellValue) => {
    if (Array.isArray(value)) {
        return value.length === 0 ? '[]' : `[...] ${value.length}`;
    }

    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';

    const preview = JSON.stringify(value);
    return preview.length > 80 ? `${preview.slice(0, 77)}...` : preview;
};

export const JsonCellPreview: FC<Props> = ({ value }) => {
    const preview = useMemo(() => getJsonPreview(value), [value]);

    return (
        <Text span inherit truncate display="block" maw="100%">
            {preview}
        </Text>
    );
};

export const JsonCellModal: FC<ModalProps> = ({ value, opened, onClose }) => {
    const [selectedPath, setSelectedPath] = useState('$');
    const formattedJson = useMemo(
        () => JSON.stringify(value, null, 2),
        [value],
    );

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="JSON cell"
            icon={IconCode}
            size="80vw"
            cancelLabel={false}
            bodyScrollAreaMaxHeight="75vh"
            headerActions={
                <CopyActionIcon
                    value={formattedJson}
                    copyLabel="Copy JSON"
                    copiedLabel="Copied JSON"
                />
            }
        >
            <Stack gap="sm">
                <Group justify="space-between" wrap="nowrap" align="flex-end">
                    <Stack gap={2} miw={0}>
                        <Text size="xs" c="dimmed">
                            Selected path
                        </Text>
                        <Text size="xs" ff="monospace" truncate>
                            {selectedPath}
                        </Text>
                    </Stack>
                    <CopyButton value={selectedPath} timeout={2000}>
                        {({ copied, copy }) => (
                            <Button
                                size="compact-xs"
                                variant="subtle"
                                color={copied ? 'teal' : 'gray'}
                                leftSection={
                                    <MantineIcon
                                        icon={copied ? IconCheck : IconCopy}
                                    />
                                }
                                onClick={copy}
                            >
                                Copy path
                            </Button>
                        )}
                    </CopyButton>
                </Group>

                <Tabs defaultValue="tree" keepMounted={false}>
                    <Tabs.List>
                        <Tabs.Tab value="tree">Tree</Tabs.Tab>
                        <Tabs.Tab value="text">Text</Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="tree" pt="sm">
                        <ScrollArea.Autosize mah="60vh">
                            <Box fz="xs">
                                <JsonTree
                                    value={value}
                                    expandDepth={0}
                                    withCopy={false}
                                    onSelectPath={setSelectedPath}
                                />
                            </Box>
                        </ScrollArea.Autosize>
                    </Tabs.Panel>

                    <Tabs.Panel value="text" pt="sm">
                        <ScrollArea.Autosize mah="60vh">
                            <CodeBlock
                                code={formattedJson}
                                language="json"
                                withCopyButton={false}
                            />
                        </ScrollArea.Autosize>
                    </Tabs.Panel>
                </Tabs>
            </Stack>
        </MantineModal>
    );
};

export const JsonCellMenuItem: FC<MenuItemProps> = ({ onClick }) => (
    <Menu.Item leftSection={<MantineIcon icon={IconEye} />} onClick={onClick}>
        View JSON
    </Menu.Item>
);
