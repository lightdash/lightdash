/**
 * Guards the CSP fix from #21276 at the level the bundle-grep guard CANNOT:
 * execution timing. The SDK broke under a strict CSP because `dbt/validation.ts`
 * compiled an Ajv validator (`new Function`) *at module import*. Making Ajv lazy
 * does not change the bundled text — only WHEN it runs — so a text grep of the
 * SDK bundle is blind to a regression here. This test asserts the runtime
 * property directly: importing the module must not generate code at all.
 */
describe('CSP: dbt/validation must not generate code at import (#21276)', () => {
    const RealFunction = global.Function;

    afterEach(() => {
        global.Function = RealFunction;
        vi.resetModules();
    });

    it('importing the module invokes no `new Function` (no eval-based codegen)', async () => {
        const constructed: string[] = [];

        // Intercept every `new Function(...)` during the import. A clean import
        // produces none; any call (Ajv schema compilation, or any other
        // code-generating dependency that creeps onto the import path) fails the
        // test, because it would break the SDK under a strict CSP.
        function FunctionTrap(...args: unknown[]) {
            constructed.push(String(args[args.length - 1] ?? '').slice(0, 80));
            return Reflect.construct(RealFunction, args);
        }
        FunctionTrap.prototype = RealFunction.prototype;
        global.Function = FunctionTrap as unknown as FunctionConstructor;

        vi.resetModules();
        await import('./validation');

        expect(constructed).toEqual([]);
    });
});
