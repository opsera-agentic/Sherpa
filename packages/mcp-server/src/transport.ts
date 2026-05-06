import readline from 'node:readline';

export interface JsonRpcMessage {
  jsonrpc: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export type RpcHandler = (msg: JsonRpcMessage) => Promise<JsonRpcMessage | null>;

/** Minimal newline-delimited JSON-RPC reader used by MCP-style stdio transports. */
export class StdioJsonRpcTransport {
  private readonly rl: readline.Interface;

  constructor(
    private readonly handler: RpcHandler,
    private readonly input: NodeJS.ReadableStream = process.stdin,
    readonly output = process.stdout,
  ) {
    this.rl = readline.createInterface({ input: this.input, crlfDelay: Infinity });
  }

  start(): void {
    this.rl.on('line', async (line) => {
      if (!line.trim()) return;
      let parsed: JsonRpcMessage;
      try {
        parsed = JSON.parse(line) as JsonRpcMessage;
      } catch {
        this.reply({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error' },
        });
        return;
      }

      try {
        const response = await this.handler(parsed);
        if (response && parsed.id !== undefined && parsed.id !== null) {
          this.reply(response);
        }
      } catch (err) {
        this.reply({
          jsonrpc: '2.0',
          id: parsed.id ?? null,
          error: { code: -32603, message: String(err) },
        });
      }
    });

    this.input.on('close', () => {
      this.rl.close();
    });
  }

  reply(message: JsonRpcMessage): void {
    this.output.write(`${JSON.stringify(message)}\n`);
  }

  stop(): void {
    this.rl.close();
  }
}
