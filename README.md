# windows2-mcp

MCP server exposing Windows desktop UI Automation as tools for AI agents, built on top of [appium-desktop-driver](https://github.com/verisoft-ai/appium-desktop-driver).

Previously shipped as `desktop-driver-mcp` inside `appium-desktop-driver`; now split into its own package so the MCP server and the Appium driver can be installed, versioned, and released independently.

## Prerequisites

- An Appium server running with `appium-desktop-driver` installed:

```bash
npm install -g appium
appium driver install --source=npm appium-desktop-driver
appium --port 4723
```

## Install

```bash
npm install -g windows2-mcp
```

or run directly with `npx windows2-mcp`.

## Configure

Environment variables (read at startup):

| Variable | Default | Description |
|---|---|---|
| `APPIUM_HOST` | `127.0.0.1` | Host of the running Appium server |
| `APPIUM_PORT` | `4723` | Port of the running Appium server |

## MCP client config

```json
{
  "mcpServers": {
    "windows2-mcp": {
      "command": "npx",
      "args": ["-y", "windows2-mcp"],
      "env": {
        "APPIUM_HOST": "127.0.0.1",
        "APPIUM_PORT": "4723"
      }
    }
  }
}
```

## Tools

See [docs/TOOLS.md](docs/TOOLS.md) for the full tool reference (~85 tools across session
management, element discovery, interaction, UIA patterns, window management, vision, and more),
generated from the current tool source.

## Development

```bash
npm install
npm run build
npm run test
npm run lint
```

## License

Apache-2.0
