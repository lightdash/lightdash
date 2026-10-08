import { type DocumentSqlChart } from '@lightdash/common';
import { Button } from '@mantine/core';
import { IconCode } from '@tabler/icons-react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../components/common/MantineIcon';
import { useCanManageSqlRunner } from './useCanManageSqlRunner';

/** Opens the chart's SQL in SQL Runner, on its connection; hidden without SQL Runner access. */
const DocumentSqlChartOpenButton = ({
    projectUuid,
    chart,
}: {
    projectUuid: string;
    chart: DocumentSqlChart;
}) => {
    const navigate = useNavigate();
    const canManageSqlRunner = useCanManageSqlRunner(undefined, projectUuid);
    if (!canManageSqlRunner) {
        return null;
    }
    return (
        <Button
            size="xs"
            variant="default"
            leftSection={<MantineIcon icon={IconCode} />}
            onClick={() =>
                void navigate(`/projects/${projectUuid}/sql-runner`, {
                    state: {
                        sql: chart.sql,
                        limit: chart.limit,
                        warehouseConnectionUuid:
                            chart.warehouseConnectionUuid ?? null,
                    },
                })
            }
        >
            Open in SQL Runner
        </Button>
    );
};

export default DocumentSqlChartOpenButton;
