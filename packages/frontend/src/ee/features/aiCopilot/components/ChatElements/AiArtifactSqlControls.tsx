import { Button, HoverCard } from '@mantine-8/core';
import { Prism } from '@mantine/prism';
import { IconEye, IconTerminal2 } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';

interface AiArtifactSqlControlsProps {
    sql: string;
    projectUuid: string;
}

export const AiArtifactSqlControls: FC<AiArtifactSqlControlsProps> = memo(
    ({ sql, projectUuid }) => {
        return (
            <>
                <HoverCard
                    shadow="subtle"
                    radius="md"
                    position="bottom-start"
                    withinPortal
                >
                    <HoverCard.Target>
                        <Button
                            size="compact-xs"
                            variant="subtle"
                            color="gray.6"
                            leftSection={
                                <MantineIcon
                                    icon={IconEye}
                                    size={12}
                                    stroke={1.5}
                                />
                            }
                        >
                            View SQL
                        </Button>
                    </HoverCard.Target>
                    <HoverCard.Dropdown p={0} maw={500}>
                        <Prism
                            language="sql"
                            withLineNumbers
                            noCopy
                            styles={{
                                lineContent: {
                                    fontSize: 10,
                                },
                            }}
                        >
                            {sql}
                        </Prism>
                    </HoverCard.Dropdown>
                </HoverCard>

                <Button
                    size="compact-xs"
                    variant="subtle"
                    color="gray.6"
                    component={Link}
                    to={{
                        pathname: `/projects/${projectUuid}/sql-runner`,
                    }}
                    state={{ sql }}
                    leftSection={
                        <MantineIcon
                            icon={IconTerminal2}
                            size={12}
                            stroke={1.5}
                        />
                    }
                >
                    Open in SQL Runner
                </Button>
            </>
        );
    },
);
