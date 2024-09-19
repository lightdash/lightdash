import {
    Accordion,
    Box,
    Button,
    Group,
    Text,
    type AccordionControlProps,
} from '@mantine/core';
import { Editor } from '@monaco-editor/react';
import { IconAlertTriangle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useAppSelector } from '../store/hooks';

const AccordionControl: FC<
    AccordionControlProps & {
        onUse: () => void;
    }
> = ({ onUse, ...props }) => {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center' }} pr="xs">
            <Accordion.Control {...props} fz="xs" fw={500} />
            <Button size="xs" compact onClick={onUse}>
                Use
            </Button>
        </Box>
    );
};

export const SqlQueryBeforeSaveAlert: FC<{
    onUse: (value: 'unsaved' | 'previous') => void;
}> = ({ onUse }) => {
    const sqlToSave = useAppSelector(
        (state) => state.sqlRunner.successfulSqlQueries.current,
    );
    const sql = useAppSelector((state) => state.sqlRunner.sql);

    return (
        <Box
            sx={(theme) => ({
                border: `1px solid ${theme.colors.gray[3]}`,
                borderRadius: theme.radius.md,
                overflow: 'hidden',
            })}
        >
            <Box bg="yellow.1" w="100%" p="xs">
                <Group spacing="xs" noWrap>
                    <MantineIcon icon={IconAlertTriangle} color="yellow.7" />
                    <Text fz="xs" fw={500}>
                        You have unsaved changes in your query. Review the
                        changes before saving.
                    </Text>
                </Group>
            </Box>

            <Accordion>
                <Accordion.Item value="unsaved-changes">
                    <AccordionControl onUse={() => onUse('unsaved')}>
                        Unsaved changes
                    </AccordionControl>
                    <Accordion.Panel>
                        <Editor
                            height={200}
                            width={400}
                            language="sql"
                            value={sql}
                            options={{
                                readOnly: true,
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                contextmenu: false,
                                lineNumbers: 'off',
                                glyphMargin: false,
                                lineDecorationsWidth: 0,
                                revealHorizontalRightPadding: 0,
                                roundedSelection: false,
                            }}
                            theme="lightdash"
                        />
                    </Accordion.Panel>
                </Accordion.Item>
                <Accordion.Item value="previous-query">
                    <AccordionControl onUse={() => onUse('previous')}>
                        Previous successful query
                    </AccordionControl>
                    <Accordion.Panel>
                        <Editor
                            height={200}
                            width={400}
                            language="sql"
                            value={sqlToSave}
                            options={{
                                readOnly: true,
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                contextmenu: false,
                                lineNumbers: 'off',
                                glyphMargin: false,
                                lineDecorationsWidth: 0,
                                revealHorizontalRightPadding: 0,
                                roundedSelection: false,
                            }}
                            theme="lightdash"
                        />
                    </Accordion.Panel>
                </Accordion.Item>
            </Accordion>
        </Box>
    );
};
