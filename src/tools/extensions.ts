import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppiumSession, ExtensionCommandInfo } from '../session.js';
import { formatError } from '../errors.js';
import { ELEMENT_KEY } from '../constants.js';

function formatCommand(name: string, info: ExtensionCommandInfo): string {
    const params = (info.params ?? []).map((p) => (p.required ? p.name : `${p.name}?`)).join(', ');
    const deprecated = info.deprecated ? ' [deprecated]' : '';
    const description = info.info ? ` — ${info.info}` : '';
    return `${name}(${params})${deprecated}${description}`;
}

function formatGroup(title: string, commands: Record<string, ExtensionCommandInfo>, filter: string | undefined): string[] {
    const names = Object.keys(commands)
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
            description: 'List every extension command (execute method) available in the current session, as Appium\'s listExtensions reports them: '
                + 'the driver\'s own "windows: …" commands plus the commands of each active Appium plugin (e.g. .NET / Java / SAP bridges, PCOMM). '
                + 'Each line shows the command name, its parameters (`?` = optional) and its description. '
                + 'Use this to discover commands that have no dedicated tool, then run them with execute_extension_command.',
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
                    : filter ? `No extension commands match "${filter}".` : 'The session declares no extension commands.';
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
