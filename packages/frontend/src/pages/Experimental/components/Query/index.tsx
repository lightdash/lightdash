import { Button, Group } from '@mantine/core';
import { IconPlayerPlay, IconSql } from '@tabler/icons-react';
import { useCallback } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useQueryResults } from '../../../../hooks/useQueryResults';
import { useSqlQueryMutation } from '../../../../hooks/useSqlQuery';
import { ExplorerDto } from '../../Dto/QuerySourceDto/ExplorerSourceDto';
import { type QuerySourceDto } from '../../Dto/QuerySourceDto/QuerySourceDto';
import { SqlRunnerDto } from '../../Dto/QuerySourceDto/SqlRunnerDto';

const QueryConfig = ({
    onSourceDtoChange,
}: {
    onSourceDtoChange: (value: QuerySourceDto) => void;
}) => {
    const { isLoading: isLoadingSqlMutation, mutateAsync: sqlQueryMutate } =
        useSqlQueryMutation();
    const { isLoading: isLoadingExploreMutation, mutateAsync: exploreMutate } =
        useQueryResults();

    const handleSqlRunnerSubmit = useCallback(async () => {
        const data = await sqlQueryMutate(
            'SELECT\n' +
                '  "orders".status AS "orders_status",\n' +
                '  DATE_TRUNC(\'WEEK\', "orders".order_date) AS "orders_order_date_week",\n' +
                '  AVG("orders".amount) AS "orders_average_order_size"\n' +
                'FROM "postgres"."jaffle"."orders" AS "orders"\n' +
                '\n' +
                '\n' +
                'GROUP BY 1,2\n' +
                'ORDER BY "orders_status"\n' +
                'LIMIT 25',
        );
        onSourceDtoChange(new SqlRunnerDto({ data }));
    }, [sqlQueryMutate, onSourceDtoChange]);

    const handleExplorerSubmit = useCallback(async () => {
        const data = await exploreMutate('orders', {
            limit: 25,
            sorts: [],
            filters: {},
            exploreName: 'orders',
            dimensions: ['orders_status', 'orders_order_date_week'],
            metrics: ['orders_average_order_size'],
            tableCalculations: [],
            customDimensions: [],
        });
        onSourceDtoChange(new ExplorerDto({ data }));
    }, [exploreMutate, onSourceDtoChange]);

    return (
        <Group>
            <Button
                size="xs"
                leftIcon={<MantineIcon icon={IconSql} />}
                onClick={handleSqlRunnerSubmit}
                loading={isLoadingSqlMutation}
            >
                Run SQL runner query
            </Button>
            <Button
                size="xs"
                leftIcon={<MantineIcon icon={IconPlayerPlay} />}
                onClick={handleExplorerSubmit}
                loading={isLoadingExploreMutation}
            >
                Run Explorer query
            </Button>
        </Group>
    );
};

export default QueryConfig;
