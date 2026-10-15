import { describe, it, expect, vi, afterEach } from 'vitest';
import { registerExtensionTools } from '../../src/tools/extensions.js';
import { AppiumSession, type ExtensionsInfo } from '../../src/session.js';
import { ELEMENT_KEY } from '../../src/constants.js';
import { createMockServer } from '../fixtures/server.js';
import { createMockSession } from '../fixtures/session.js';

const EXTENSIONS: ExtensionsInfo = {
    rest: {
        driver: {
            'windows: getWindows': { command: 'emGetWindows' },
            'windows: setValue': {
                command: 'emSetValue',
                info: 'Set a value',
                params: [{ name: 'elementId', required: true }, { name: 'value', required: true }],
            },
            'windows: click': { command: 'emClick', params: [{ name: 'elementId', required: false }] },
        },
        plugins: {
            PcommPlugin: {
                'pcomm: sendAidKey': { command: 'pcommSendAidKey', params: [{ name: 'key', required: true }] },
                'pcomm: legacy': { command: 'pcommLegacy', deprecated: true },
            },
        },
    },
};

function setup() {
    const server = createMockServer();
    const mocks = createMockSession();
    (mocks.session as any).listExtensions = vi.fn().mockResolvedValue(EXTENSIONS);
    registerExtensionTools(server, mocks.session);
    return { server, ...mocks };
}

describe('extension tools', () => {
    describe('list_extension_commands', () => {
        it('lists driver and plugin commands with their params', async () => {
            const { server } = setup();

            const result = await server.call('list_extension_commands', {}) as any;
            const text: string = result.content[0].text;

            expect(result.isError).toBeUndefined();
            expect(text).toContain('driver (3):');
            expect(text).toContain('windows: setValue(elementId, value) — Set a value');
            expect(text).toContain('windows: click(elementId?)');
            expect(text).toContain('windows: getWindows()');
            expect(text).toContain('plugin PcommPlugin (2):');
            expect(text).toContain('pcomm: sendAidKey(key)');
            expect(text).toContain('pcomm: legacy() [deprecated]');
        });

        it('filters by name, case-insensitively', async () => {
            const { server } = setup();

            const text: string = ((await server.call('list_extension_commands', { filter: 'PCOMM:' })) as any).content[0].text;

            expect(text).not.toContain('driver');
            expect(text).toContain('pcomm: sendAidKey');
        });

        it('says so when nothing matches', async () => {
            const { server } = setup();

            const text: string = ((await server.call('list_extension_commands', { filter: 'nope' })) as any).content[0].text;

            expect(text).toBe('No extension commands match "nope".');
        });

        it('returns isError when listing fails', async () => {
            const { server, session } = setup();
            (session as any).listExtensions = vi.fn().mockRejectedValue(new Error('No active session.'));

            const result = await server.call('list_extension_commands', {}) as any;

            expect(result.isError).toBe(true);
        });
    });

    describe('execute_extension_command', () => {
        it('calls executeScript with the named args object', async () => {
            const { server, mockBrowser } = setup();

            const result = await server.call('execute_extension_command', {
                command: 'pcomm: sendAidKey', args: { key: 'Enter' },
            }) as any;

            expect(mockBrowser.executeScript).toHaveBeenCalledWith('pcomm: sendAidKey', [{ key: 'Enter' }]);
            expect(result.content[0].text).toBe("executed 'pcomm: sendAidKey'");
        });

        it('passes an empty object when no args are given', async () => {
            const { server, mockBrowser } = setup();

            await server.call('execute_extension_command', { command: 'windows: getWindows' });

            expect(mockBrowser.executeScript).toHaveBeenCalledWith('windows: getWindows', [{}]);
        });

        it('returns strings as-is and unwraps element references in structured results', async () => {
            const { server, mockBrowser } = setup();
            mockBrowser.executeScript = vi.fn()
                .mockResolvedValueOnce('screen text')
                .mockResolvedValueOnce({ items: [{ [ELEMENT_KEY]: 'el-1' }, { [ELEMENT_KEY]: 'el-2' }], count: 2 });

            const first = await server.call('execute_extension_command', { command: 'pcomm: getScreenText' }) as any;
            const second = await server.call('execute_extension_command', { command: 'windows: something' }) as any;

            expect(first.content[0].text).toBe('screen text');
            expect(JSON.parse(second.content[0].text)).toEqual({ items: ['el-1', 'el-2'], count: 2 });
        });

        it('returns isError on failure', async () => {
            const { server, mockBrowser } = setup();
            mockBrowser.executeScript = vi.fn().mockRejectedValue(new Error('Unknown command'));

            const result = await server.call('execute_extension_command', { command: 'windows: nope' }) as any;

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Unknown command');
        });
    });
});

describe('AppiumSession.listExtensions', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function activeSession() {
        const session = new AppiumSession({ appiumHost: '127.0.0.1', appiumPort: 4723 } as any);
        (session as any).driver = { sessionId: 'abc-123' };
        return session;
    }

    it('GETs the session\'s appium/extensions endpoint and returns its value', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ value: EXTENSIONS }) });
        vi.stubGlobal('fetch', fetchMock);

        const result = await activeSession().listExtensions();

        expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:4723/session/abc-123/appium/extensions');
        expect(result).toEqual(EXTENSIONS);
    });

    it('throws with the W3C error message on failure', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false, status: 404, json: async () => ({ value: { error: 'unknown command', message: 'not supported' } }),
        }));

        await expect(activeSession().listExtensions()).rejects.toThrow('listExtensions failed (HTTP 404): not supported');
    });

    it('throws when there is no active session', async () => {
        const session = new AppiumSession({ appiumHost: '127.0.0.1', appiumPort: 4723 } as any);

        await expect(session.listExtensions()).rejects.toThrow('No active session');
    });
});
