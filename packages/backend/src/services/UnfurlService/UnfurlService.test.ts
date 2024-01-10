import { snakeCaseName } from '@lightdash/common';
import { nanoid } from 'nanoid';
import { UnfurlService } from './UnfurlService';

describe('UnfurlService', () => {
    test('isValidImageFileId', () => {
        const validNames = [
            `slack-image-${nanoid()}.png`,
            `slack-image_${snakeCaseName('my dashboard')}_${nanoid()}.png`,
            `slack-image_${snakeCaseName('TEST')}_${nanoid()}.png`,
            `slack-image_${snakeCaseName(
                '> dashboard 1234 !',
            )}_${nanoid()}.png`,
            `slack-image-notification-${nanoid()}.png`,
        ];

        const invalidNames = [
            `without_prefix-${nanoid()}.png`,
            `slack-image_without_suffix-${nanoid()}`,
            `slack-image_withoutnanoid.png`,
            `slack-${nanoid()}.png`,
            `slack_image-${nanoid()}.png`,
            `slack-image-with space_${nanoid()}.png`,
            `slack-image_UPPERCASE_${nanoid()}.png`,
        ];
        validNames.forEach((name) => {
            expect(name + UnfurlService.isValidImageFileId(name)).toEqual(
                name + true,
            );
        });
        invalidNames.forEach((name) => {
            expect(name + UnfurlService.isValidImageFileId(name)).toEqual(
                name + false,
            );
        });
    });
});
