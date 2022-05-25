import { friendlyName } from './field';

describe('Field tests', () => {
    describe('friendlyName', () => {
        test('friendlyName should convert correctly', async () => {
            expect(friendlyName('my_column')).toEqual('My column');

            expect(friendlyName('with_number_1234')).toEqual(
                'With number 1234',
            );
            expect(friendlyName('with_symbols_!/()')).toEqual('With symbols');

            expect(friendlyName('ALL_UPPERCASE')).toEqual('All uppercase');
        });
    });
});
