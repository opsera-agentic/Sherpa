import type { LoggerOptions } from '../logger.js';
import { createLogger } from '../logger.js';
import { startSherpaMcpServer } from '@sherpa/mcp-server';

export interface ServeCommandOptions extends LoggerOptions {
  projectRoot: string;
  allowWrite?: boolean;
}

export async function runServe(opts: ServeCommandOptions): Promise<void> {
  const logger = createLogger('serve', opts);

  logger.info('serve.start', 'Starting MCP stdio server', {
    projectRoot: opts.projectRoot,
    allowWrite: Boolean(opts.allowWrite),
  });

  startSherpaMcpServer({
    projectRoot: opts.projectRoot,
    allowWrite: opts.allowWrite,
  });
}
