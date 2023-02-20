import { Colors, H5 } from '@blueprintjs/core';
import { IconLayoutDashboard } from '@tabler/icons-react';
import { FC } from 'react';
import { useHistory } from 'react-router-dom';
import { Subtitle } from '../../pages/CreateProject.styles';
import { CardContent, CardWrapper } from './SettingsUsageAnalytics.styles';

interface ProjectUserAccessProps {
    projectUuid: string;
}

const SettingsUsageAnalytics: FC<ProjectUserAccessProps> = ({
    projectUuid,
}) => {
    const history = useHistory();

    return (
        <>
            <>
                <Subtitle>
                    Lightdash curated dashboards that show usage and performance
                    information about your project.
                </Subtitle>

                <>
                    <CardWrapper
                        onClick={() => {
                            history.push(
                                `/projects/${projectUuid}/user-activity`,
                            );
                        }}
                    >
                        <CardContent>
                            <IconLayoutDashboard
                                size={20}
                                color={Colors.GRAY3}
                            />
                            <H5>User activity</H5>
                        </CardContent>
                    </CardWrapper>
                </>
            </>
        </>
    );
};

export default SettingsUsageAnalytics;
