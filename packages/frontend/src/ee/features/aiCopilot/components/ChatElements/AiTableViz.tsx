import {
    friendlyName,
    type ApiAiAgentThreadMessageViz,
} from '@lightdash/common';
import { ScrollArea, Table } from '@mantine-8/core';
import type { FC } from 'react';

type Props = {
    results: ApiAiAgentThreadMessageViz['results'];
};

const AiTableViz: FC<Props> = ({ results }) => {
    return (
        <ScrollArea mah={500}>
            <Table
                stickyHeader
                withRowBorders
                withColumnBorders
                striped
                highlightOnHover
            >
                <Table.Thead>
                    <Table.Tr>
                        {Object.entries(results.fields).map(([key, field]) => (
                            <Table.Th key={key}>
                                {friendlyName(field.name)}
                            </Table.Th>
                        ))}
                    </Table.Tr>
                </Table.Thead>

                <Table.Tbody>
                    {results.rows.map((row) => (
                        <Table.Tr key={row.id}>
                            {Object.entries(row).map(([key, value]) => (
                                <Table.Td key={key}>{value}</Table.Td>
                            ))}
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        </ScrollArea>
    );
};

export default AiTableViz;
