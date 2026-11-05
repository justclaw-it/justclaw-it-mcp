// Minimal Streamable-HTTP MCP client (initialize -> tools/list -> tools/call).
// Zero dependencies: uses the global fetch shipped with Node 18+.

export const DEFAULT_URL = 'https://justclaw.it.com/mcp';
export const PROTOCOL_VERSION = '2025-06-18';

export class McpError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function parseBody(text, contentType) {
  if ((contentType || '').includes('text/event-stream')) {
    // Take the last JSON-RPC message carried in a `data:` line.
    let last = null;
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith('data:')) {
        const payload = line.slice(5).trim();
        if (payload) last = payload;
      }
    }
    return last ? JSON.parse(last) : null;
  }
  return text ? JSON.parse(text) : null;
}

export class McpClient {
  constructor({ url = DEFAULT_URL, apiKey, timeoutMs = 30000, clientName = 'justclaw-it-cli', clientVersion = '0.0.0' }) {
    this.url = url;
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.clientInfo = { name: clientName, version: clientVersion };
    this.sessionId = null;
    this.nextId = 1;
  }

  headers() {
    const h = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${this.apiKey}`,
    };
    if (this.sessionId) h['mcp-session-id'] = this.sessionId;
    if (this.protocolVersion) h['mcp-protocol-version'] = this.protocolVersion;
    return h;
  }

  async post(message) {
    let res;
    try {
      res = await fetch(this.url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new McpError(`cannot reach ${this.url}: ${err.cause?.code || err.message}`, { code: 'NETWORK' });
    }
    const sid = res.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;
    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new McpError('API key rejected (401). Check the key at https://justclaw.it.com/account', { status: res.status, code: 'AUTH' });
    }
    if (res.status === 202 || res.status === 204) return null;
    if (!res.ok) {
      throw new McpError(`HTTP ${res.status} from MCP server: ${text.slice(0, 200)}`, { status: res.status });
    }
    const body = parseBody(text, res.headers.get('content-type'));
    if (body && body.error) {
      throw new McpError(`MCP error ${body.error.code}: ${body.error.message}`, { code: body.error.code });
    }
    return body;
  }

  async request(method, params) {
    const id = this.nextId++;
    const body = await this.post({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) });
    return body ? body.result : null;
  }

  async connect() {
    const result = await this.request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: this.clientInfo,
    });
    this.protocolVersion = result?.protocolVersion || PROTOCOL_VERSION;
    this.serverInfo = result?.serverInfo || {};
    await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' });
    return result;
  }

  async listTools() {
    const result = await this.request('tools/list', {});
    return result?.tools || [];
  }

  async callTool(name, args = {}) {
    const result = await this.request('tools/call', { name, arguments: args });
    if (result?.isError) {
      const msg = (result.content || []).map((c) => c.text).filter(Boolean).join('\n');
      throw new McpError(`tool ${name} failed: ${msg.slice(0, 300)}`);
    }
    const text = (result?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async close() {
    if (!this.sessionId) return;
    try {
      await fetch(this.url, { method: 'DELETE', headers: this.headers(), signal: AbortSignal.timeout(5000) });
    } catch {
      // best effort
    }
  }
}

// GET <origin>/usage -> per-key tier / usage summary (bearer-authenticated).
export async function fetchUsage(apiKey, mcpUrl = DEFAULT_URL) {
  const url = new URL('/usage', mcpUrl).toString();
  try {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
