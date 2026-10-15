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
import { useTranslation } from 'react-i18next';
import ReactJson, { type OnSelectProps } from 'react-json-view';
import { useRjvTheme } from '../../../hooks/useRjvTheme';
import { CopyActionIcon } from '../CopyActionIcon';
import MantineIcon from '../MantineIcon';
import MantineModal from '../MantineModal';
import classes from './JsonCellViewer.module.css';
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

const getJsonPath = (select: Pick<OnSelectProps, 'name' | 'namespace'>) => {
    const path = [...select.namespace, select.name].filter(
        (part): part is string => part !== null,
    );

    if (path.length === 0) return '$';

    return path.reduce<string>((acc, part) => {
        const key = String(part);
        return /^\d+$/.test(key) ? `${acc}[${key}]` : `${acc}.${key}`;
    }, '$');
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
        <Text
            span
            inherit
            style={{
                display: 'block',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
            }}
        >
            {preview}
        </Text>
    );
};

export const JsonCellModal: FC<ModalProps> = ({ value, opened, onClose }) => {
    const { t } = useTranslation('table');
    const [selectedPath, setSelectedPath] = useState('$');
    const theme = useRjvTheme();
    const formattedJson = useMemo(
        () => JSON.stringify(value, null, 2),
        [value],
    );

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={t('jsonViewer.title')}
            icon={IconCode}
            size="80vw"
            cancelLabel={false}
            bodyScrollAreaMaxHeight="75vh"
            headerActions={
                <CopyActionIcon
                    value={formattedJson}
                    copyLabel={t('jsonViewer.copyJson')}
                    copiedLabel={t('jsonViewer.copiedJson')}
                />
            }
        >
            <Stack gap="sm">
                <Group justify="space-between" wrap="nowrap" align="flex-end">
                    <Stack gap={2} miw={0}>
                        <Text size="xs" c="dimmed">
                            {t('jsonViewer.selectedPath')}
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
                                {t('jsonViewer.copyPath')}
                            </Button>
                        )}
                    </CopyButton>
                </Group>

                <Tabs defaultValue="tree" keepMounted={false}>
                    <Tabs.List>
                        <Tabs.Tab value="tree">
                            {t('jsonViewer.treeTab')}
                        </Tabs.Tab>
                        <Tabs.Tab value="text">
                            {t('jsonViewer.textTab')}
                        </Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="tree" pt="sm">
                        <ScrollArea.Autosize mah="60vh">
                            <Box fz="xs">
                                <ReactJson
                                    src={value as object}
                                    name={null}
                                    theme={theme}
                                    collapsed={1}
                                    displayDataTypes={false}
                                    enableClipboard={false}
                                    onSelect={(select) =>
                                        setSelectedPath(getJsonPath(select))
                                    }
                                />
                            </Box>
                        </ScrollArea.Autosize>
                    </Tabs.Panel>

                    <Tabs.Panel value="text" pt="sm">
                        <ScrollArea.Autosize mah="60vh">
                            <Box
                                component="pre"
                                fz="xs"
                                m={0}
                                className={classes.formattedJson}
                            >
                                {formattedJson}
                            </Box>
                        </ScrollArea.Autosize>
                    </Tabs.Panel>
                </Tabs>
            </Stack>
        </MantineModal>
    );
};

export const JsonCellMenuItem: FC<MenuItemProps> = ({ onClick }) => {
    const { t } = useTranslation('table');
    return (
        <Menu.Item
            leftSection={<MantineIcon icon={IconEye} />}
            onClick={onClick}
        >
            {t('jsonViewer.viewJson')}
        </Menu.Item>
    );
};
