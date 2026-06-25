/**
 * Guards the CSP fix from #21276 at the level the bundle-grep guard CANNOT:
 * execution timing. The SDK broke under a strict CSP because `dbt/validation.ts`
 * compiled an Ajv validator (`new Function`) *at module import*. Making Ajv lazy
 * does not change the bundled text — only WHEN it runs — so a text grep of the
 * SDK bundle is blind to a regression here. This test asserts the runtime
 * property directly: importing the module must not generate validator code.
 */
describe('CSP: dbt/validation must not compile schemas at import (#21276)', () => {
    const RealFunction = global.Function;

    afterEach(() => {
        global.Function = RealFunction;
        jest.resetModules();
    });

    it('importing the module does not invoke Ajv code-generation', async () => {
        const generatedValidators: string[] = [];

        // Intercept `new Function(...)` and record bodies that look like
        // Ajv-generated validators (they reference vErrors / instancePath /
        // validateN). Other incidental Function construction is ignored so the
        // assertion only fires on schema compilation.
        function FunctionTrap(...args: unknown[]) {
            const body = String(args[args.length - 1] ?? '');
            if (/vErrors|instancePath|\bvalidate\d/.test(body)) {
                generatedValidators.push(body.slice(0, 80));
            }
            return Reflect.construct(RealFunction, args);
        }
        FunctionTrap.prototype = RealFunction.prototype;
        global.Function = FunctionTrap as unknown as FunctionConstructor;

        jest.resetModules();
        await import('./validation');

        expect(generatedValidators).toEqual([]);
    });
});
