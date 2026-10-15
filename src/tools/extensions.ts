import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppiumSession, ExtensionCommandInfo } from '../session.js';
import { formatError } from '../errors.js';
import { ELEMENT_KEY } from '../constants.js';

/**
 * Extension commands that already have a dedicated tool, mapped to that tool. They are left
 * out of list_extension_commands so the agent only sees what it cannot reach otherwise.
 * test/tools/extensions.test.ts checks this against the executeScript calls in src/tools.
 */
export const COVERED_COMMANDS: Readonly<Record<string, string>> = {
    'powerShell': 'execute_powershell',
    'windows: addToSelection': 'add_to_selection',
    'windows: allSelectedItems': 'get_all_selected_items',
    'windows: attachDotnetBridge': 'attach_dotnet_bridge',
    'windows: attachJavaSwing': 'attach_java_swing',
    'windows: click': 'advanced_click',
    'windows: clickAndDrag': 'click_and_drag',
    'windows: close': 'close_window',
    'windows: closeApp': 'close_app',
    'windows: collapse': 'collapse_element',
    'windows: deleteFile': 'delete_file',
    'windows: deleteFolder': 'delete_folder',
    'windows: expand': 'expand_element',
    'windows: getClipboard': 'get_clipboard',
    'windows: getDeviceTime': 'get_device_time',
    'windows: getMonitors': 'get_monitors',
    'windows: getNativeChildren': 'get_native_children',
    'windows: getValue': 'get_element_value',
    'windows: getWindowElement': 'get_window_element',
    'windows: getWindows': 'get_windows',
    'windows: hover': 'hover',
    'windows: invoke': 'invoke_element',
    'windows: isMultiple': 'is_multi_select',
    'windows: keys': 'send_keys',
    'windows: launchApp': 'launch_app',
    'windows: maximize': 'maximize_window',
    'windows: minimize': 'minimize_window',
    'windows: removeFromSelection': 'remove_from_selection',
    'windows: restore': 'restore_window',
    'windows: scroll': 'scroll',
    'windows: scrollIntoView': 'scroll_element_into_view',
    'windows: select': 'select_item',
    'windows: selectFromCombobox': 'select_from_combobox',
    'windows: selectedItem': 'get_selected_item',
    'windows: setClipboard': 'set_clipboard',
    'windows: setFocus': 'focus_element',
    'windows: setValue': 'set_element_value',
    'windows: startRecordingScreen': 'start_recording_screen',
    'windows: stopRecordingScreen': 'stop_recording_screen',
    'windows: switchToWindowByTitle': 'switch_to_window_by_title',
    'windows: toggle': 'toggle_element',
};

function formatCommand(name: string, info: ExtensionCommandInfo): string {
    const params = (info.params ?? []).map((p) => (p.required ? p.name : `${p.name}?`)).join(', ');
    const deprecated = info.deprecated ? ' [deprecated]' : '';
    const description = info.info ? ` — ${info.info}` : '';
    return `${name}(${params})${deprecated}${description}`;
}

function formatGroup(title: string, commands: Record<string, ExtensionCommandInfo>, filter: string | undefined): string[] {
    const names = Object.keys(commands)
        .filter((name) => !(name in COVERED_COMMANDS))
        .filter((name) => !filter || name.toLowerCase().includes(filter.toLowerCase()))
        .sort();
    if (names.length === 0) {return [];}
    return [`${title} (${names.length}):`, ...names.map((name) => `  ${formatCommand(name, commands[name])}`)];
}

// W3C element references ({ "element-6066-…": id }) become plain element ID strings, so the
// result can be fed straight back into other tools.
function unwrapElements(value: unknown): unknown {
    if (Array.isArray(value)) {return value.map(unwrapElements);}
    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const keys = Object.keys(record);
        if (keys.length === 1 && keys[0] === ELEMENT_KEY) {return record[ELEMENT_KEY];}
        return Object.fromEntries(keys.map((key) => [key, unwrapElements(record[key])]));
    }
    return value;
}

export function registerExtensionTools(server: McpServer, session: AppiumSession): void {
    server.registerTool(
        'list_extension_commands',
        {
            description: 'List the extension commands (execute methods) available in the current session that have no dedicated tool, as Appium\'s listExtensions reports them: '
                + 'the driver\'s own "windows: …" commands plus the commands of each active Appium plugin (e.g. .NET / Java / SAP bridges, PCOMM). '
                + 'Commands already covered by a dedicated tool are left out — use that tool instead. '
                + 'Each line shows the command name, its parameters (`?` = optional) and its description. '
                + 'Run a listed command with execute_extension_command.',
            inputSchema: {
                filter: z.string().optional().describe('Only list commands whose name contains this text (case-insensitive), e.g. "window" or "pcomm:"'),
            },
            annotations: { readOnlyHint: true },
        },
        async ({ filter }) => {
            try {
                const { rest } = await session.listExtensions();
                const lines = formatGroup('driver', rest.driver ?? {}, filter);
                for (const [plugin, commands] of Object.entries(rest.plugins ?? {})) {
                    lines.push(...formatGroup(`plugin ${plugin}`, commands, filter));
                }
                const text = lines.length > 0
                    ? lines.join('\n')
                    : filter ? `No extension commands match "${filter}".` : 'No extension commands beyond the ones covered by dedicated tools.';
                return { content: [{ type: 'text' as const, text }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'execute_extension_command',
        {
            description: 'Run any extension command (execute method) of the driver or an active plugin by name, e.g. "windows: getWindows" or "pcomm: getScreenText". '
                + 'Call list_extension_commands first to get the exact name and parameters. Prefer a dedicated tool when one exists — use this for commands without one, '
                + 'including commands added by plugins. Pass element IDs (from find_element) as plain strings, usually under `elementId`. '
                + 'Element references in the result are returned as plain element ID strings. '
                + 'Some commands are destructive (closing apps, deleting files): confirm with the user before running those.',
            inputSchema: {
                command: z.string().min(1).describe('Exact command name as listed by list_extension_commands, e.g. "windows: getWindows"'),
                args: z.record(z.string(), z.unknown()).optional().describe('Named parameters of the command, e.g. { "elementId": "…", "value": "Finance" }. Omit when it takes none.'),
            },
            annotations: { destructiveHint: true },
        },
        async ({ command, args }) => {
            try {
                const driver = session.getDriver();
                const result = unwrapElements(await driver.executeScript(command, [args ?? {}]));
                const text = result === undefined || result === null
                    ? `executed '${command}'`
                    : typeof result === 'string' ? result : JSON.stringify(result, null, 2);
                return { content: [{ type: 'text' as const, text }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );
}
