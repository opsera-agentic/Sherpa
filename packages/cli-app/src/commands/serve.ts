import type { LoggerOptions } from '../logger.js';
import { createLogger } from '../logger.js';
import { startSherpaMcpServer } from '@sherpa/mcp-server';
import { withTelemetry } from '../telemetry.js';

export interface ServeCommandOptions extends LoggerOptions {
  projectRoot: string;
  allowWrite?: boolean;
}

export async function runServe(opts: ServeCommandOptions): Promise<void> {
  await withTelemetry(opts.projectRoot, 'serve', async () => {
    const logger = createLogger('serve', opts);

    logger.info('serve.start', 'Starting MCP stdio server', {
      projectRoot: opts.projectRoot,
      allowWrite: Boolean(opts.allowWrite),
    });

    startSherpaMcpServer({
      projectRoot: opts.projectRoot,
      allowWrite: opts.allowWrite,
    });

    return { allowWrite: Boolean(opts.allowWrite) };
  });
}
