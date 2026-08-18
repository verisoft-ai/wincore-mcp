/** Minimal stderr logger — MCP servers must never write logs to stdout (it carries the JSON-RPC stream). */
export function getLogger(namespace: string) {
    return {
        debug(message: string): void {
            if (process.env.DEBUG) {
                process.stderr.write(`[${namespace}] ${message}\n`);
            }
        },
    };
}
