import { Box, Button } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { type FC } from 'react';
import { useProjectCompileLogByJob } from '../../hooks/useProjectCompileLogs';
import JsonTree from '../common/JsonViewer/JsonTree';
import MantineIcon from '../common/MantineIcon';
import { CollapsablePaper } from './../common/CollapsablePaper';

type ProjectCompileLogProps = {
    projectUuid: string;
    jobUuid: string;
};

const ProjectCompileLog: FC<ProjectCompileLogProps> = ({
    projectUuid,
    jobUuid,
}) => {
    const { data: compileLog } = useProjectCompileLogByJob({
        projectUuid,
        jobUuid,
    });

    if (!compileLog) {
        return null;
    }

    return (
        <CollapsablePaper
            title="Compilation log"
            rightAction={
                <Button
                    variant="subtle"
                    color="gray"
                    size="compact-xs"
                    rightSection={<MantineIcon icon={IconExternalLink} />}
                    component="a"
                    target="_blank"
                    href={`/generalSettings/projectManagement/${projectUuid}/compilationHistory`}
                >
                    See history
                </Button>
            }
        >
            <Box fz="xs">
                <JsonTree
                    value={compileLog}
                    expandDepth={1}
                    withCopy
                    onSelectPath={null}
                />
            </Box>
        </CollapsablePaper>
    );
};

export default ProjectCompileLog;
