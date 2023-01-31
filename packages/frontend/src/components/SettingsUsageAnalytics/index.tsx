import { Colors, Icon } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { FC } from 'react';
import { useHistory } from 'react-router-dom';
import {
    ActivityIcon,
    ActivityLabel,
    CardContent,
    CardWrapper,
    Header,
    Title,
    TitleWrapper,
} from './SettingsUsageAnalytics.styles';

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
                <Header>
                    <TitleWrapper>
                        <Title>Usage analytics</Title>
                        <Tooltip2 content="Lightdash curated dashboards that show usage and performance information about your project.">
                            <Icon
                                icon="info-sign"
                                style={{ color: Colors.GRAY5 }}
                            />
                        </Tooltip2>
                    </TitleWrapper>
                </Header>
                <>
                    <CardWrapper
                        onClick={() => {
                            history.push(
                                `/projects/${projectUuid}/user-activity`,
                            );
                        }}
                    >
                        <CardContent>
                            <ActivityIcon icon="control" size={24} />
                            <ActivityLabel>User activity</ActivityLabel>
                        </CardContent>
                    </CardWrapper>
                </>
            </>
        </>
    );
};

export default SettingsUsageAnalytics;
