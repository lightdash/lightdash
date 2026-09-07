import { Select } from '@mantine/core';
import { useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineModal from '../../../components/common/MantineModal';
import { useExplores } from '../../../hooks/useExplores';

type Props = {
    projectUuid: string;
    dataAppVizUuid: string;
    onClose: () => void;
};

/**
 * Table picker behind "Preview in explorer": the explorer needs a table to
 * run against, so the user chooses one and lands there with the chart type
 * preselected and its config panel open (dataAppVizUuid + chartSidebar
 * params, handled in useExplorerRoute).
 */
const ChartTypePreviewTableModal: FC<Props> = ({
    projectUuid,
    dataAppVizUuid,
    onClose,
}) => {
    const navigate = useNavigate();
    const [tableName, setTableName] = useState<string | null>(null);
    const exploresQuery = useExplores(projectUuid, true);
    const options = (exploresQuery.data ?? [])
        .filter((explore) => !('errors' in explore))
        .map((explore) => ({ value: explore.name, label: explore.label }));

    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Preview in explorer"
            confirmLabel="Open in explorer"
            confirmDisabled={tableName === null}
            onConfirm={() => {
                if (tableName === null) return;
                void navigate(
                    `/projects/${projectUuid}/tables/${tableName}?dataAppVizUuid=${dataAppVizUuid}&chartSidebar=configure`,
                );
            }}
        >
            <Select
                label="Table"
                description="Choose the table to preview this chart type with."
                placeholder="Select a table"
                searchable
                data={options}
                value={tableName}
                onChange={setTableName}
                disabled={exploresQuery.isInitialLoading}
                data-autofocus
            />
        </MantineModal>
    );
};

export default ChartTypePreviewTableModal;
