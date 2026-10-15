#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { AppiumSession } from './session.js';
import { registerAllTools } from './tools/index.js';

async function main() {
    // Step 1: Load infrastructure config (host, port — no app required)
    let config;
    try {
        config = loadConfig();
    } catch (err) {
        process.stderr.write(`[MCP] Configuration error: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
    }

    // Step 2: Create session holder (no app launched yet — agent calls create_session)
    const session = new AppiumSession(config);

    // Step 4: Create and configure MCP server
    const server = new McpServer({
        name: 'wincore-mcp',
        version: '1.0.0',
    }, {
        instructions: `
You are a Windows desktop automation agent using the Appium Wincore driver via UI Automation (UIA).

## Session
- Before starting, ask the user: should you launch a new app or connect to an existing session?
- If connecting to an existing session: call list_sessions, show the results to the user, and ask which session to attach to before calling attach_session.
- Only call delete_session when the user explicitly asks to end the session.

## Finding elements
1. Call get_page_source to inspect the current UIA element tree. This is your source of truth — call it whenever you are unsure about the current UI state.
2. Use the Names and AutomationIds from the tree to call find_element.
3. If the element is not in the tree, fall back to visual analysis: use analyze_screen for the calling agent to analyze the image directly (no API key needed), or find_by_vision to delegate analysis to an external vision model (requires an API key).
4. Use those coordinates with advanced_click to interact.

## Clicking elements
1. Use click_element for standard UIA element clicks.
2. If click_element does not trigger the expected action, try invoke_element (UIA Invoke pattern).
3. For right-click, double-click, modifier keys, or coordinate-based clicks, use advanced_click.

## Combo boxes and dropdowns
- To pick an entry from a combo box, dropdown, list box, or tree, call select_from_combobox with the container's elementId and the entry's exact text. It opens, finds (also in virtualized lists), selects, and closes in one call — do not expand, find, and click the item yourself.
- If it fails with "no such element", call expand_element and get_page_source to read the real entry names (matching is exact and case-sensitive), then retry with the correct text.
- Fall back to expand_element + find_element + select_item/click_element only when the dropdown opens as a separate top-level window. For editable combo boxes where free text is wanted, use set_element_value.

## Typing and clicking
- Prefer element-scoped tools (set_value, click_element) whenever you have an elementId — they act on the element directly and work even if the window is not focused or in the foreground.
- Only use send_keys or advanced_click when there is no addressable element (key combos, coordinate-only clicks, controls with no UIA representation) — these simulate real input and require the target window to be focused/foreground.

## Extension commands (driver and plugins)
- Dedicated tools cover the common driver commands. The driver and active Appium plugins (e.g. .NET / Java / SAP bridges, PCOMM terminal) may offer more.
- When no tool fits the task, call list_extension_commands (use filter to narrow, e.g. "pcomm:") to discover them, then run one with execute_extension_command using the exact name and named args.
- list_extension_commands only shows commands without a dedicated tool; for everything else use the dedicated tool. Confirm with the user before running destructive commands (closing apps, deleting files, killing processes).

## Multiple windows
Call get_window_handles to list open windows, then switch_to_window to focus the target.

## Java Swing / AWT apps
If the user asks to automate a Java application (Swing, AWT, or any app launched via a JVM), always pass javaSwing: true to create_session. Without this flag, UIA will not see any elements inside the Java window.

## WinForms/WPF apps with custom-drawn controls (e.g. DevExpress)
If get_page_source returns an empty or suspiciously shallow tree for a WinForms/WPF window (common with DevExpress and similar custom-drawn control libraries), attach to the window first with attachTopLevelWindow/appTopLevelWindow, then call attach_dotnet_bridge (or pass dotnetBridge: true at session creation alongside appTopLevelWindow). This only attaches to an already-running process — there is no launch-time injection. Both .NET Framework (clr.dll) and CoreCLR (.NET 5+, coreclr.dll) targets are supported; the driver detects which one is running and attaches accordingly, no extra configuration needed.

## Webview / hybrid apps
Call get_contexts to list available contexts. If WEBVIEW contexts are present, ask the user which to switch to before calling set_context.

## General
- When in doubt about what is on screen or what changed, call get_page_source before acting.
- When in doubt about what the user wants, ask before taking action.
- Never call delete_session, close_app, or any destructive tool without explicit user confirmation.
`.trim(),
    });

    // Step 5: Register all tools (including create_session / delete_session)
    registerAllTools(server, session);

    // Step 6: Shutdown handler
    let shuttingDown = false;
    async function shutdown(reason: string) {
        if (shuttingDown) {return;}
        shuttingDown = true;
        process.stderr.write(`[MCP] Shutting down (${reason})...\n`);

        if (session.isActive()) {
            await Promise.race([
                session.delete(),
                new Promise<void>((resolve) => setTimeout(resolve, 10_000)),
            ]);
        }

        process.exit(0);
    }

    process.on('SIGINT', () => { shutdown('SIGINT'); });
    process.on('SIGTERM', () => { shutdown('SIGTERM'); });
    process.stdin.on('end', () => { shutdown('stdin closed'); });

    // Step 7: Connect transport (stdout is owned by MCP protocol — all logs go to stderr)
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write('[MCP] wincore-mcp server ready. Call create_session to launch an app.\n');
}

main();
