import { ActionIcon } from '@mantine-8/core';
import { IconSend } from '@tabler/icons-react';
import { EditorContent, useEditor } from '@tiptap/react';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import classes from './AnnouncementComposer.module.css';
import { createAnnouncementExtensions } from './announcementExtensions';
import { serializeAnnouncementMarkdown } from './serializeAnnouncementMarkdown';

type Props = {
    projectUuid: string;
    onPost: (markdown: string) => void;
};

export const AnnouncementComposer: FC<Props> = ({ projectUuid, onPost }) => {
    const editor = useEditor({
        extensions: createAnnouncementExtensions(() => projectUuid),
    });

    const handlePost = () => {
        if (!editor) return;
        const markdown = serializeAnnouncementMarkdown(editor, projectUuid);
        if (!markdown) return;
        onPost(markdown);
        editor.commands.clearContent();
    };

    return (
        <div className={classes.composer}>
            <EditorContent editor={editor} className={classes.editorContent} />
            <ActionIcon
                variant="subtle"
                size="lg"
                color="ldGray.6"
                aria-label="Post announcement"
                onClick={handlePost}
            >
                <MantineIcon icon={IconSend} />
            </ActionIcon>
        </div>
    );
};
