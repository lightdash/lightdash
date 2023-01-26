import { FC } from 'react';
import Input from '../../ReactHookForm/Input';
import MarkdownInput from '../../ReactHookForm/MarkdownInput';

const MarkdownTileForm: FC = () => (
    <>
        <Input name="title" label="Title" placeholder="Tile title" />

        <MarkdownInput
            name="content"
            label="Content"
            attributes={{
                preview: 'edit',
                height: 400,
                overflow: false,
            }}
        />
    </>
);

export default MarkdownTileForm;
