# windows2-mcp Tool Reference

Full reference for every tool exposed by the `windows2-mcp` MCP server. Generated from
`src/tools/*.ts` — each tool's name, parameters, and description come straight from its
`registerTool()` call, so this stays accurate as long as it's regenerated after tool changes.

Tools are grouped by file/domain, mirroring `src/tools/index.ts` → `registerAllTools()`.

## Before you start: Appium must already be running

`windows2-mcp` does **not** manage an Appium server for you — there is no auto-start flow.
`create_session` checks `http://<APPIUM_HOST>:<APPIUM_PORT>/status` and throws immediately if
nothing answers:

```
Appium not running on 127.0.0.1:4723. Start it first with: appium --port 4723
```

Start Appium yourself before calling any session tool:

```bash
npm install -g appium
appium driver install --source=npm appium-desktop-driver
appium --port 4723
```

`APPIUM_HOST` (default `127.0.0.1`) and `APPIUM_PORT` (default `4723`) are read once at MCP
server startup from the environment — see the root [README.md](../README.md).

---

## Session Management (`session.ts`)

| Tool | Params | Description |
|---|---|---|
| `create_session` | `app?`, `appArguments?`, `appWorkingDir?`, `waitForAppLaunch?`, `shouldCloseApp?` (default `true`), `implicitTimeout?` (default `1500`), `delayAfterClick?`, `delayBeforeClick?`, `smoothPointerMove?`, `webviewEnabled?`, `webviewDevtoolsPort?`, `javaSwing?`, `jdkPath?`, `appTopLevelWindow?`, `dotnetBridge?`, `newSessionCommandTimeout?`, `ieDriverServerPath?` | Launch a Windows application and start a new Appium session. Destructive — ask the user before calling. |
| `attach_session` | `sessionId` | Attach to an existing Appium session by session ID (visible in Appium Inspector or server logs). |
| `delete_session` | — | End the current session and close the app. Only call when the user explicitly asks. |
| `get_session_status` | — | Check whether a session is active in this MCP server instance. |

**`create_session` param notes:**

- `app`: executable path (`C:\Windows\notepad.exe`), UWP App ID
  (`Microsoft.WindowsCalculator_8wekyb3d8bbwe!App`), or `"Root"` to attach to the desktop root.
  Omit when using `appTopLevelWindow` instead.
- `appTopLevelWindow`: native HWND (decimal or hex, e.g. `"0x001A0B2C"`) of an already-running
  window to attach to instead of launching a new app. Required for `dotnetBridge`; usable with
  `javaSwing` too.
- `javaSwing` / `jdkPath`: inject the Java accessibility agent at launch for Java Swing/AWT apps.
  `jdkPath` required if `javaSwing: true` and `JAVA_HOME` isn't set.
- `dotnetBridge`: inject the .NET bridge DLL for WinForms/WPF apps with custom-drawn controls
  (e.g. DevExpress) that barely expose anything via UIA. **Requires `appTopLevelWindow`** — there
  is no launch-time injection for .NET, only attach-to-running-process. Both .NET Framework
  (`clr.dll`) and CoreCLR / .NET 5+ (`coreclr.dll`) targets are auto-detected.
- `webviewEnabled` / `webviewDevtoolsPort`: enable CDP support for hybrid apps with embedded
  Edge/Chrome webviews — pairs with the context tools below.
- `ieDriverServerPath`: path to a local `IEDriverServer.exe`, overriding the auto-downloaded one
  when IE windows are automated.

If `javaSwing`/`dotnetBridge` weren't set at session creation, attach them later with
`attach_java_swing` / `attach_dotnet_bridge` (see [Application Control](#application-control-appts)).

---

## Element Discovery (`find.ts`)

All four tools share the same locator strategy enum and priority guidance.

**Locator strategies** (`strategy` param, enum):

| Strategy | Maps to | Reliability |
|---|---|---|
| `accessibility id` | UIA `AutomationId` | High — preferred whenever the element has a non-empty AutomationId |
| `id` | Alias for `accessibility id` | High |
| `name` | UIA `Name` (visible label/title) | Medium — stable unless localized or dynamic |
| `xpath` | Evaluated against the live UIA tree | Medium — flexible fallback, e.g. `//Button[@Name="OK"]` |
| `class name` | UIA `ClassName` | Low — rarely unique alone |
| `tag name` | UIA `ControlType` (e.g. `Button`, `Edit`) | Low — rarely unique alone |
| `-windows uiautomation` | Raw UIA condition expression | Advanced compound queries |

Preferred order: `accessibility id` → `name` → `xpath` → others. After interacting with an
element you plan to reuse in generated test code, call `get_element_info` to get the best
locator.

| Tool | Params | Description |
|---|---|---|
| `find_element` | `strategy`, `selector` | Find a single element. Returns an element ID string, or errors if not found. |
| `find_elements` | `strategy`, `selector` | Find all matching elements. Returns a JSON array of element ID strings. |
| `find_child_element` | `parentElementId`, `strategy`, `selector` | Find a child scoped to a known parent's subtree — use when the same selector appears in multiple places. |
| `wait_for_element` | `strategy`, `selector`, `timeoutMs?` (default `5000`), `pollIntervalMs?` (default `200`) | Poll until an element appears, then return its ID. Useful after dialogs open, page transitions, or spinners disappear. |

---

## Basic Interaction (`interact.ts`)

All operate directly on an element ID and do **not** require the target window to be focused
or in the foreground.

| Tool | Params | Description |
|---|---|---|
| `click_element` | `elementId` | Click an element by ID. |
| `set_value` | `elementId`, `value` | Clear then set an input element's text. |
| `clear_element` | `elementId` | Clear an input element's text. |
| `get_text` | `elementId` | Get an element's visible text content. |
| `get_attribute` | `elementId`, `attribute` | Get a UIA property (e.g. `Name`, `AutomationId`, `ClassName`, `IsEnabled`, `IsOffscreen`, `ControlType`, `Value.Value`). Returns `""` if absent. |
| `is_element_displayed` | `elementId` | Is the element visible (not off-screen)? |
| `is_element_enabled` | `elementId` | Is the element enabled and interactable? |
| `is_element_selected` | `elementId` | Is a checkbox/radio/toggle checked? Works for UIA and Java Swing. Tri-state (indeterminate) checkboxes return `false` — indistinguishable from unchecked. |

---

## Element Inspection (`inspect.ts`)

| Tool | Params | Description |
|---|---|---|
| `get_element_info` | `elementId` | Fetch `Name`, `AutomationId`, `ClassName`, `ControlType`, `IsEnabled`, plus a ranked list of `suggestedSelectors` for test code. **Call this after every `find_element` when generating automation code.** |
| `get_active_element` | — | Get the element ID that currently has keyboard focus. |
| `get_element_tag_name` | `elementId` | Get the ControlType (native context) or HTML tag name (IE/webview context). |
| `get_element_rect` | `elementId` | Get position (relative to the app window) and size. |
| `get_element_screenshot` | `elementId` | Screenshot cropped to one element, base64 PNG. Not supported in IE context. |

`get_element_info`'s `suggestedSelectors` are ranked: `accessibility id` (AutomationId) = highest
→ `name` → `xpath` combos → `class name` = lowest. For .NET/C# Appium code it recommends
`MobileBy.AccessibilityId(automationId)` when AutomationId is non-empty.

---

## Window & Frame Management (`window.ts`)

| Tool | Params | Description |
|---|---|---|
| `get_page_source` | — | XML dump of the current UIA element tree. Source of truth for current UI state — use whenever unsure what's on screen or after a UI change. |
| `get_window_rect` | — | Position and size of the current app window. |
| `get_window_handles` | — | All window handles for the session. |
| `get_windows` | — | All visible windows including untitled ones, as `{handle, title, className}[]`. Use `className` to identify untitled popups/dialogs. |
| `switch_to_window` | `handle` | Switch focus by handle (from `get_window_handles`). |
| `switch_to_window_by_title` | `title`, `exact?` | Switch focus by title. Substring + case-insensitive match by default; `exact: true` requires a full case-insensitive match. |
| `get_window_title` | — | Name property of the current root window element. |
| `get_current_window_handle` | — | Current window handle as a hex HWND string (e.g. `"0x00abc123"`). |
| `maximize_current_window` | — | Maximize the session's root window (whole-window op, no elementId needed). |
| `minimize_current_window` | — | Minimize the session's root window (whole-window op, no elementId needed). |
| `set_window_rect` | `x`, `y`, `width`, `height` (each nullable) | Move/resize the root window; restores from maximized/minimized first. `null` on any field leaves that dimension unchanged. |
| `get_monitors` | — | List connected monitors with bounds, working area, device name, and primary flag. |
| `navigate_back` | — | Alt+Left in the current window's history. |
| `navigate_forward` | — | Alt+Right in the current window's history. |

**Window-pattern tools** (UIA `Window` pattern — operate on a specific window *element ID*, not
the whole session root; distinct from the `*_current_window` tools above):

| Tool | Params | Description |
|---|---|---|
| `maximize_window` | `elementId` | Maximize via UIA Window pattern. |
| `minimize_window` | `elementId` | Minimize via UIA Window pattern. |
| `restore_window` | `elementId` | Restore from minimized/maximized via UIA Window pattern. |
| `close_window` | `elementId` | Close via UIA Window pattern. |

**Frame tools** (IE context only):

| Tool | Params | Description |
|---|---|---|
| `switch_to_frame` | one of `index`, `name`, `elementId` | Switch into an iframe/frame inside an IE window. Scopes subsequent finds to that frame's document. |
| `switch_to_parent_frame` | — | Switch to the parent frame; behaves like `switch_to_default_content` at top level. |
| `switch_to_default_content` | — | Return to the top-level document after `switch_to_frame`. |

---

## Advanced Input (`advanced.ts`)

Simulates real OS-level mouse/keyboard events — **the target window must be visible and in the
foreground** for these (unlike the element-ID-targeted tools in Basic Interaction).

`modifierKeys` is a shared param: `z.array(z.enum(['shift','ctrl','alt','win'])).default([])`.

| Tool | Params | Description |
|---|---|---|
| `advanced_click` | `elementId?` or `x`+`y`, `button?` (`left`\|`right`\|`middle`\|`back`\|`forward`, default `left`), `modifierKeys?`, `durationMs?` (default `0`, for long-press), `times?` (default `1`, `2` = double-click), `interClickDelayMs?` (default `100`) | Click at an element or absolute screen coordinates, with modifiers, repeat clicks, or hold duration. Use for right-click, double-click, Ctrl+click, or coordinate clicks. |
| `send_keys` | `actions` (array of `{pause?, text?, virtualKeyCode?, down?}`), `forceUnicode?` (default `false`) | Send real key events to whatever window has keyboard focus. Cannot target a specific element. Use for key combos (Ctrl+C, Alt+Tab), navigation keys, or controls with no addressable element. |
| `hover` | `startElementId?`/`startX`/`startY`, `endElementId?`/`endX`/`endY`, `modifierKeys?`, `durationMs?` (default `500`) | Move the pointer from one position to another. Hover effects, drag-without-click. |
| `scroll` | `elementId?` or `x`+`y`, `deltaX?` (default `0`), `deltaY?` (default `0`), `modifierKeys?` | Scroll the mouse wheel at an element or coordinate. |
| `perform_actions` | `actions` (raw W3C action-sequence objects) | Low-level raw W3C Actions (pointer/key/wheel sources). Use only when you need multi-source synchronized input (e.g. a key held during a pointer drag) that the higher-level tools can't express. |
| `release_actions` | — | Release all keys/buttons left held down by a prior `perform_actions` call — use to recover from a sequence that errored mid-way. |
| `click_and_drag` | `startElementId?`/`startX`/`startY`, `endElementId?`/`endX`/`endY`, `modifierKeys?`, `durationMs?` (default `500`), `button?` (default `left`) | Click and drag between two positions. Resizing, reordering, moving elements. |

---

## UIA Patterns (`patterns.ts`)

Direct calls into specific UI Automation control patterns — bypass mouse/keyboard simulation
entirely, useful for elements that don't respond to synthetic input.

| Tool | Params | Description |
|---|---|---|
| `invoke_element` | `elementId` | Invoke pattern — trigger the default action without simulating a click. |
| `expand_element` | `elementId` | ExpandCollapse pattern — expand a tree node, combo box, or menu. |
| `collapse_element` | `elementId` | ExpandCollapse pattern — collapse. |
| `toggle_element` | `elementId` | Toggle pattern — flip a checkbox/toggle button. Follow with `is_element_selected` to confirm state. |
| `set_element_value` | `elementId`, `value` | Value/RangeValue pattern — set sliders, spin boxes, etc. |
| `get_element_value` | `elementId` | Value pattern — read the current value. |
| `focus_element` | `elementId` | Focus pattern (`windows: setFocus`) — required before keyboard-driven interaction with a specific control. |
| `select_item` | `elementId` | SelectionItem pattern (`windows: select`) — select an item in a list/tab/combo when a plain click doesn't trigger selection. |
| `is_multi_select` | `elementId` | Selection pattern — does this container (e.g. ListBox) allow multi-select? |
| `scroll_element_into_view` | `elementId` | ScrollItem pattern — scroll a container so the element becomes visible. Use before clicking something that may be out of the scroll viewport. |
| `get_selected_item` | `elementId` | Selection pattern — first selected item in a container. Returns an element ID. |
| `get_all_selected_items` | `elementId` | Selection pattern — all selected items in a multi-select container. Returns a JSON array of element IDs. |
| `add_to_selection` | `elementId` | SelectionItem pattern — add an item to the current selection without deselecting others. |
| `remove_from_selection` | `elementId` | SelectionItem pattern — remove an item from the current selection. |

---

## Application Control (`app.ts`)

| Tool | Params | Description |
|---|---|---|
| `get_window_element` | — | Element ID of the session's root window element. |
| `launch_app` | — | (Re-)launch the app configured for this session. |
| `close_app` | — | Close the app under test without ending the Appium session. Only call when explicitly asked. |
| `attach_java_swing` | `jdkPath?` | Inject the Java accessibility agent into the JVM owning the session window — use post-creation if `javaSwing` wasn't set at `create_session` time. After this, element finding uses Java class names/accessible names instead of UIA. |
| `attach_dotnet_bridge` | — | Inject the .NET bridge into the CLR process owning the session window — use post-creation if `dotnetBridge` wasn't set at `create_session` time. For WinForms/WPF apps with custom-drawn controls (e.g. DevExpress) that expose little via UIA. Only works on an already-running process; auto-detects .NET Framework vs CoreCLR. |
| `get_device_time` | — | Current date/time on the Windows device. |

---

## Clipboard (`clipboard.ts`)

| Tool | Params | Description |
|---|---|---|
| `get_clipboard` | `contentType?` (`plaintext`\|`image`, default `plaintext`) | Read clipboard contents as base64. |
| `set_clipboard` | `b64Content`, `contentType?` (default `plaintext`) | Set clipboard contents from base64. |

---

## Context Switching (`context.ts`)

For hybrid apps with embedded webviews (requires `webviewEnabled` at session creation).

| Tool | Params | Description |
|---|---|---|
| `get_current_context` | — | Current active context: `NATIVE_APP` (UIA tree, `find_element` works) or `WEBVIEW_<id>` (web DOM, standard web selectors apply). |
| `get_contexts` | — | List all available contexts. |
| `set_context` | `name` | Switch active context — `NATIVE_APP` or a `WEBVIEW_<id>` from `get_contexts`. |

---

## Vision (`vision.ts`)

Both tools take a DPI-aware screenshot and compute a coordinate mapping (root-window vs
per-monitor bounds, DPI scale) so coordinates the model reports map correctly onto the real
screen.

| Tool | Params | Description |
|---|---|---|
| `analyze_screen` | `prompt` | Take a screenshot and hand it back to the **calling agent** for visual analysis — no external API key needed. Response includes step-by-step image→screen coordinate conversion instructions when the mapping is available. |
| `find_by_vision` | `prompt`, `responseFormat?` (`coordinates`\|`text`, default `coordinates`), `model` (required), `includeAnnotatedImage?` (default `false`) | Take a screenshot and delegate analysis to an **external** vision model. `model` prefix picks the provider/credential: `claude-*` → `ANTHROPIC_API_KEY`, `gpt-*`/`o-*` → `OPENAI_API_KEY`, `gemini-*` → `GEMINI_API_KEY`, `amazon.nova-*` → `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`. `coordinates` mode does Set-of-Mark detection, annotates the image, has the model pick a tag, then maps it to screen coords → `{x, y, label, steps}`. |

---

## Recording (`recording.ts`)

FFmpeg-based screen recording.

| Tool | Params | Description |
|---|---|---|
| `start_recording_screen` | `outputPath?`, `timeLimit?`, `videoFps?`, `videoFilter?`, `preset?`, `captureCursor?`, `captureClicks?`, `audioInput?`, `forceRestart?` (default `true`) | Start recording. If one's already running, stopped and restarted by default. |
| `stop_recording_screen` | `remotePath?`, `user?`, `pass?`, `method?`, `headers?`, `fileFieldName?`, `formFields?` | Stop and return the video — base64 inline by default, or uploaded to `remotePath` first if provided. |

---

## Files (`files.ts`)

All require the `modify_fs` insecure feature enabled on the Appium server, and operate on the
filesystem of the **machine running the driver**, not the target app's sandbox.

| Tool | Params | Description |
|---|---|---|
| `push_file` | `remotePath`, `base64Data` | Write a file. |
| `pull_file` | `remotePath` | Read a file, returned as base64. |
| `delete_file` | `path` | Delete a file. |
| `delete_folder` | `path`, `recursive?` (default `true`) | Delete a folder. |

---

## Internet Explorer (`ie.ts`)

Only valid when the active window is an IE window — automatically entered by `switch_to_window`
/ `switch_to_window_by_title` when the target is an IE window.

| Tool | Params | Description |
|---|---|---|
| `get_url` | — | Get the current page URL. |
| `set_url` | `url` | Navigate the IE window to a URL via `IHTMLWindow2.navigate` through the IE COM bridge — no Ctrl+L needed, window doesn't need to be foreground. |

---

## Native/MSAA Fallback (`native.ts`)

| Tool | Params | Description |
|---|---|---|
| `get_native_children` | `elementId` | Fallback for legacy WinForms/ActiveX controls exposing zero UIA children (verify with `get_page_source` / Inspect.exe first). Walks the control's raw IAccessible (MSAA) tree instead of UIA — recovers rows/cells hand-built for screen readers as "simple children" that UIA/Win32 enumeration can't see. Returns a tree of `{name, role, value, description, state, defaultAction, rect, childCount, children}`. If `supported` is `false` or the root has zero children, the control paints its own content with no accessibility tree at all — fall back to `find_by_vision` / `analyze_screen` + `advanced_click`. |

---

## System (`system.ts`)

| Tool | Params | Description |
|---|---|---|
| `get_orientation` | — | Current display orientation (`LANDSCAPE`\|`PORTRAIT`). |
| `execute_powershell` | `script` | Run a raw PowerShell script/command inside the session's persistent PowerShell process. For automation not covered elsewhere (registry edits, service control, file inspection). Runs with the driver process's privileges — treat as unrestricted code execution. |

---

## Example Workflows

### Launch Notepad, type text, verify

```
create_session { app: "C:\\Windows\\notepad.exe" }
find_element { strategy: "class name", selector: "RichEditD2DPT" }
  → elementId "e123..."
set_value { elementId: "e123...", value: "Hello from windows2-mcp" }
get_text { elementId: "e123..." }
  → "Hello from windows2-mcp"
delete_session
```

### Find a button, get a stable locator for generated test code

```
create_session { app: "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App" }
find_element { strategy: "name", selector: "Seven" }
  → elementId "e456..."
get_element_info { elementId: "e456..." }
  → { name: "Seven", automationId: "num7Button", ...,
      suggestedSelectors: [
        { strategy: "accessibility id", selector: "num7Button", reliability: "high", ... },
        ...
      ] }
click_element { elementId: "e456..." }
```

### Attach to a running window and inject the .NET bridge for a DevExpress app

```
get_windows
  → [{ handle: "0x00abc123", title: "My DevExpress App", className: "WindowsForms10..." }, ...]
create_session { appTopLevelWindow: "0x00abc123", dotnetBridge: true }
get_page_source
  → inspect UIA tree; if DevExpress controls are missing, use bridge-aware find/inspect
```

(If `dotnetBridge` wasn't set at creation, call `attach_dotnet_bridge` after `create_session`
instead.)

### Legacy WinForms grid with no UIA children

```
find_element { strategy: "class name", selector: "SysListView32" }
  → elementId "e789..."
get_native_children { elementId: "e789..." }
  → tree of rows/cells via MSAA, or { supported: false } if the control paints its own content
```

If `supported` is `false`, fall back to vision:

```
analyze_screen { prompt: "Find the row containing 'Invoice #4471' and its Amount cell" }
  → screen_x/screen_y coordinates
advanced_click { x: <screen_x>, y: <screen_y> }
```

### Multi-window dialog handling

```
click_element { elementId: "<button that opens a dialog>" }
get_windows
  → [..., { handle: "0x00def456", title: "", className: "#32770" }]  // untitled dialog
switch_to_window { handle: "0x00def456" }
find_element { strategy: "name", selector: "OK" }
click_element { elementId: "..." }
```

### Record a repro while driving the UI

```
start_recording_screen { captureCursor: true, captureClicks: true, timeLimit: 60 }
... interact with the app ...
stop_recording_screen
  → base64 mp4
```

### Hybrid app with an embedded webview

```
create_session { app: "MyHybridApp.exe", webviewEnabled: true, webviewDevtoolsPort: 9222 }
get_contexts
  → ["NATIVE_APP", "WEBVIEW_1234"]
set_context { name: "WEBVIEW_1234" }
find_element { strategy: "xpath", selector: "//button[text()='Submit']" }
click_element { elementId: "..." }
set_context { name: "NATIVE_APP" }
```
