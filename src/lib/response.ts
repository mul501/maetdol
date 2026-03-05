/** Standard MCP tool success response */
export function ok(data: object) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

/** Standard MCP tool error response */
export function toolError(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true }
}
