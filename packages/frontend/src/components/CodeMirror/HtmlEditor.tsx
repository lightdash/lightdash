import type { FC } from 'react';
import {
    BaseCodeMirrorEditor,
    type BaseCodeMirrorEditorProps,
} from './BaseCodeMirrorEditor';

export interface HtmlEditorProps
    extends Omit<BaseCodeMirrorEditorProps, 'language'> {}

export const HtmlEditor: FC<HtmlEditorProps> = (props) => {
    return <BaseCodeMirrorEditor language="html" {...props} />;
};
