import { Select } from '@mantine/core';
import { IconFolder } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useProjects } from '../../../hooks/useProjects';
import { type DataProjectSwitch } from './dataProjectSwitch';

type Props = {
    dataProject: DataProjectSwitch;
    /** Called before switching, so the host can close what it hangs off. */
    onSwitch: () => void;
};

/** The project whose tables and saved charts the picker lists. */
const DataProjectSelect: FC<Props> = ({ dataProject, onSwitch }) => {
    const { data: projects, isInitialLoading } = useProjects();
    const options = useMemo(
        () =>
            (projects ?? [])
                .map((project) => ({
                    value: project.projectUuid,
                    label: project.name,
                }))
                .sort((a, b) => a.label.localeCompare(b.label)),
        [projects],
    );

    return (
        <Select
            size="xs"
            mb="xs"
            label="Project"
            aria-label="Preview data project"
            data={options}
            value={dataProject.projectUuid}
            disabled={isInitialLoading}
            searchable
            allowDeselect={false}
            leftSection={<MantineIcon icon={IconFolder} size={14} />}
            comboboxProps={{ withinPortal: false }}
            onChange={(projectUuid) => {
                const project = projects?.find(
                    (candidate) => candidate.projectUuid === projectUuid,
                );
                if (!project || projectUuid === dataProject.projectUuid) {
                    return;
                }
                onSwitch();
                dataProject.onChange(project);
            }}
        />
    );
};

export default DataProjectSelect;
