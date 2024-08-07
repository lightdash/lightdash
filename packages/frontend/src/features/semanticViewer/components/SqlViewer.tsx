import { Prism } from '@mantine/prism';
import { type FC } from 'react';

type SqlEditorProps = {
    sql: string;
};

const SqlViewer: FC<SqlEditorProps> = ({ sql }) => {
    return (
        <Prism m="sm" language="sql" withLineNumbers>
            {sql}
        </Prism>
    );
};

export default SqlViewer;
