export interface McpStatus {
  running: boolean;
  port: number;
  writeEnabled: boolean;
  toolCount: number;
  tunnelRunning: boolean;
  tunnelUrl: string | null;
  tunnelError: string | null;
}

export interface McpToolDescriptor {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  readOnly: boolean;
}

export interface McpCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  client: string;
}

export interface ExportPdfTechnology {
  id: string;
  g: string;
  n: string;
  d: string;
  mono?: string;
  iconDataUri?: string;
  entities: string[];
}

export interface ExportPdfPayload {
  title: string;
  diagramSvg: string;
  diagramWidth: number;
  diagramHeight: number;
  diagramDpi: number;
  technologies: ExportPdfTechnology[];
}

export interface VectorDesktopApi {
  exportPdf: (payload: ExportPdfPayload) => Promise<Uint8Array>;
  mcp: {
    status: () => Promise<McpStatus>;
    start: () => Promise<McpStatus>;
    stop: () => Promise<McpStatus>;
    setWriteEnabled: (enabled: boolean) => Promise<McpStatus>;
    getToken: () => Promise<string>;
    regenerateToken: () => Promise<string>;
    tunnelStart: () => Promise<McpStatus>;
    tunnelStop: () => Promise<McpStatus>;
    registerTools: (tools: McpToolDescriptor[]) => void;
    onCall: (callback: (call: McpCall) => void) => () => void;
    onState: (callback: (status: McpStatus) => void) => () => void;
    respond: (id: string, ok: boolean, payload?: unknown, error?: string) => void;
  };
}

declare global {
  interface Window {
    vectorDesktop?: VectorDesktopApi;
  }
}
