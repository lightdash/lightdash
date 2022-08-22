import { DashboardChartTile } from '@lightdash/common';
import { ActionModalProps } from '../../common/modal/ActionModal';
import Input from '../../ReactHookForm/Input';
import MarkdownInput from '../../ReactHookForm/MarkdownInput';

const MarkdownTileForm = ({
    isDisabled,
}: Pick<
    ActionModalProps<DashboardChartTile['properties']>,
    'useActionModalState' | 'isDisabled'
>) => (
    <>
        <Input
            name="title"
            label="Title"
            disabled={isDisabled}
            placeholder="Tile title"
        />
        <MarkdownInput
            name="content"
            label="Content"
            disabled={isDisabled}
            attributes={{
                preview: 'edit',
                height: 400,
                overflow: false,
            }}
        />
    </>
);

export default MarkdownTileForm;
