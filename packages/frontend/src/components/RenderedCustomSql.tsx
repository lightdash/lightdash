import { Alert, Loader, Stack, Title } from '@mantine/core';
import { Prism } from '@mantine/prism';
import { IconAlertCircle } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useCustomCompiledSql } from '../hooks/useCustomCompiledSql';
import { useExplorerContext } from '../providers/ExplorerProvider';

function findMatchingLines(fullSql: string, sqlChunk: string): number[] {
    // Normalize the chunk for comparison
    const normalizedChunk = sqlChunk
        .toLowerCase()
        .split('\n')
        .map((line) => line.trim());

    // Split the full SQL into lines and normalize each for comparison
    const lines = fullSql
        .toLowerCase()
        .split('\n')
        .map((line) => line.trim());

    const matchingLineNumbers: number[] = [];

    // Iterate through each line of the full SQL
    for (let i = 0; i < lines.length; i++) {
        // If the current line matches the first line of the chunk
        if (lines[i].startsWith(normalizedChunk[0])) {
            // Check if the rest of the chunk matches the rest of the lines
            let match = true;
            for (let j = 1; j < normalizedChunk.length; j++) {
                if (lines[i + j] !== normalizedChunk[j]) {
                    match = false;
                    break;
                }
            }

            // If the chunk matches, add the line numbers to the list
            if (match) {
                for (let j = 0; j < normalizedChunk.length; j++) {
                    matchingLineNumbers.push(i + j + 1);
                }
            }
        }
    }

    return matchingLineNumbers;
}

const RenderCustomSql = () => {
    const { data: fullSql, error, isInitialLoading } = useCustomCompiledSql();
    const customSql = useExplorerContext((c) => c.state.customExplore?.sql);

    const matchingLines = useMemo(() => {
        if (!fullSql || !customSql) return [];
        return findMatchingLines(fullSql, customSql);
    }, [fullSql, customSql]);

    if (isInitialLoading) {
        return (
            <Stack my="xs" align="center">
                <Loader size="lg" color="gray" mt="xs" />
                <Title order={4} fw={500} color="gray.7">
                    Compiling SQL
                </Title>
            </Stack>
        );
    }

    if (error) {
        return (
            <div style={{ margin: 10 }}>
                <Alert
                    icon={<IconAlertCircle size="1rem" />}
                    title="Compilation error"
                    color="red"
                    variant="filled"
                >
                    <p>{error.error.message}</p>
                </Alert>
            </div>
        );
    }

    return (
        <Prism
            m="sm"
            language="sql"
            withLineNumbers
            highlightLines={Object.fromEntries(
                matchingLines.map((line) => [line, { color: 'violet' }]),
            )}
        >
            {fullSql ?? ''}
        </Prism>
    );
};

export default RenderCustomSql;
