import { type AiPromptContextItem } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../../../../testing/testUtils';
import {
    buildContentReferenceSegments,
    getPromptContextItemHref,
    getPromptContextItemKey,
} from './contentReferenceUtils';
import { ThreadImageReference } from './ThreadImageReference';

const image: Extract<AiPromptContextItem, { type: 'thread_image' }> & {
    previewUrl: string;
} = {
    type: 'thread_image',
    fileUuid: 'image-uuid',
    fileName: 'revenue.png',
    sizeBytes: 1234,
    mediaType: 'image/png',
    width: 1600,
    height: 900,
    expiresAt: '2100-01-01T00:00:00.000Z',
    previewUrl: 'blob:private-local-preview',
};

test('images remain metadata pills even if the prompt mentions the filename', () => {
    expect(getPromptContextItemKey(image)).toBe('thread_image:image-uuid');
    expect(getPromptContextItemHref(image, 'project')).toBeNull();
    const result = buildContentReferenceSegments('Recreate revenue.png', [
        image,
    ]);
    expect(result.segments).toEqual([
        { type: 'text', text: 'Recreate revenue.png' },
    ]);
    expect(result.matchedKeys.size).toBe(0);
});

test('history shows dimensions and expiry without a thumbnail, link or preview URL', () => {
    const { container } = renderWithProviders(
        <ThreadImageReference item={image} />,
    );
    expect(
        screen.getByText(/revenue.png · 1600×900 · Expires/),
    ).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.innerHTML).not.toContain('blob:');
});

test('expired history gives re-upload guidance while preserving original metadata', () => {
    renderWithProviders(
        <ThreadImageReference
            item={{ ...image, expiresAt: '2000-01-01T00:00:00.000Z' }}
        />,
    );
    expect(
        screen.getByText(
            /revenue.png · 1600×900 · Expired — re-upload to use again/,
        ),
    ).toBeInTheDocument();
});
