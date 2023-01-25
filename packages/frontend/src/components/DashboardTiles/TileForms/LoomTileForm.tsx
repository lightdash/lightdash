import { DashboardChartTile } from '@lightdash/common';
import { ActionModalProps } from '../../common/modal/ActionModal';
import Input from '../../ReactHookForm/Input';

export const getLoomId = (value: string): string | undefined => {
    const arr = value.match(/share\/(.*)/);
    return arr?.[1];
};

const LoomTileForm = ({
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
            rules={{
                required: 'Required field',
            }}
            placeholder="Tile title"
        />
        <Input
            name="url"
            label="Loom url"
            disabled={isDisabled}
            rules={{
                required: 'Required field',
                validate: (value: string) =>
                    getLoomId(value) ? undefined : 'Loom url not valid',
            }}
            placeholder="e.g https://www.loom.com/share/1234567890"
        />
    </>
);

export default LoomTileForm;
