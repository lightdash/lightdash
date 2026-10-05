import { Button, Code, CopyButton, ScrollArea, Stack } from '@mantine/core';

export const SqlPanel = ({
    sql,
    copyLabel = 'Copy SQL',
}: {
    sql: string;
    copyLabel?: string;
}) => (
    <Stack gap="xs">
        <ScrollArea h={240}>
            <Code block>{sql}</Code>
        </ScrollArea>
        <CopyButton value={sql}>
            {({ copied, copy }) => (
                <Button size="xs" variant="default" onClick={copy}>
                    {copied ? 'Copied' : copyLabel}
                </Button>
            )}
        </CopyButton>
    </Stack>
);
