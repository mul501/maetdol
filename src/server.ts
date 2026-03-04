import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerSessionTool } from './tools/session.js'
import { registerTasksTool } from './tools/tasks.js'
import { registerScoreAmbiguityTool } from './tools/score-ambiguity.js'
import { registerRalphIterateTool } from './tools/ralph-iterate.js'
import { registerDetectStagnationTool } from './tools/detect-stagnation.js'
import { registerDesignTool } from './tools/design.js'
import { registerTeardownTool } from './tools/teardown.js'

const server = new McpServer({
  name: 'maetdol',
  version: '0.1.0',
})

registerSessionTool(server)
registerTasksTool(server)
registerScoreAmbiguityTool(server)
registerRalphIterateTool(server)
registerDetectStagnationTool(server)
registerDesignTool(server)
registerTeardownTool(server)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((error) => {
  console.error('maetdol server error:', error)
  process.exit(1)
})
