import { Colors, H5 } from '@blueprintjs/core';
import { Card, Table, Title } from '@mantine/core';
import { IconLayoutDashboard } from '@tabler/icons-react';
import { FC } from 'react';
import { useHistory } from 'react-router-dom';
import { useSchedulerLogs } from '../../hooks/scheduler/useScheduler';
import { Subtitle } from '../../pages/CreateProject.styles';

interface ProjectUserAccessProps {
    projectUuid: string;
}

const SettingsScheduledDeliveries: FC<ProjectUserAccessProps> = ({
    projectUuid,
}) => {
    const { data } = useSchedulerLogs(projectUuid);
    console.log(data);

    const tableHeaders = (
        <tr>
            <th>Status</th>
            <th>Name</th>
            <th>Scheduled content</th>
            <th>Delivery started</th>
            <th>Schedule</th>
        </tr>
    );

    // const rows = elements.map((element) => (
    //     <tr key={element.name}>
    //         <td>{element.position}</td>
    //         <td>{element.name}</td>
    //         <td>{element.symbol}</td>
    //         <td>{element.mass}</td>
    //     </tr>
    // ));

    return (
        <Card withBorder shadow="xs">
            <Title order={5}>Run history</Title>
            <Table my="md" horizontalSpacing="md">
                <thead>{tableHeaders}</thead>
            </Table>
            <></>
        </Card>
    );
};

export default SettingsScheduledDeliveries;
