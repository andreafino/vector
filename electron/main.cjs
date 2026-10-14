const { app, BrowserWindow, ipcMain, safeStorage } = require("electron");
const { spawn } = require("node:child_process");
const { randomBytes, randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { renderDiagramPdf, validateRequestBody, ValidationError } = require("./pdfExport.cjs");

const APP_ICON = path.join(__dirname, "..", "build", "icon.png");
const MCP_PORT = 3939;
const MCP_CALL_TIMEOUT_MS = 15000;
const DEVTUNNEL_URL_PATTERN = /https:\/\/[^\s,]+devtunnels\.ms[^\s,]*/;

const mcp = {
  mainWin: null,
  token: null,
  server: null,
  writeEnabled: false,
  tools: [],
  pending: new Map(),
  tunnel: null,
  tunnelUrl: null,
  tunnelError: null,
};

function createSplashWindow() {
  const splash = new BrowserWindow({
    width: 280,
    height: 280,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: "#fbfaf8",
    icon: APP_ICON,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  splash.loadFile(path.join(__dirname, "splash.html"));
  return splash;
}

function createWindow(splash) {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    autoHideMenuBar: true,
    icon: APP_ICON,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mcp.mainWin = win;
  win.on("closed", () => {
    if (mcp.mainWin === win) mcp.mainWin = null;
    stopTunnel();
    stopServer();
  });

  win.once("ready-to-show", () => {
    if (!splash.isDestroyed()) splash.close();
    win.show();
  });

  if (!app.isPackaged) {
    win.loadURL("http://localhost:5173");
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

function tokenFile() {
  return path.join(app.getPath("userData"), "mcp-token.bin");
}

function readStoredToken() {
  if (!safeStorage.isEncryptionAvailable() || !fs.existsSync(tokenFile())) return null;
  try {
    return safeStorage.decryptString(fs.readFileSync(tokenFile()));
  } catch {
    return null;
  }
}

function storeToken(token) {
  if (!safeStorage.isEncryptionAvailable()) return;
  fs.writeFileSync(tokenFile(), safeStorage.encryptString(token));
}

function ensureToken() {
  if (!mcp.token) {
    mcp.token = readStoredToken() ?? randomBytes(32).toString("base64url");
    storeToken(mcp.token);
  }
  return mcp.token;
}

function notifyState() {
  const win = mcp.mainWin;
  if (win && !win.isDestroyed()) win.webContents.send("mcp:state", mcpStatus());
}

function mcpStatus() {
  return {
    running: !!mcp.server,
    port: MCP_PORT,
    writeEnabled: mcp.writeEnabled,
    toolCount: visibleTools().length,
    tunnelRunning: !!mcp.tunnel,
    tunnelUrl: mcp.tunnelUrl,
    tunnelError: mcp.tunnelError,
  };
}

function visibleTools() {
  return mcp.tools.filter((tool) => mcp.writeEnabled || tool.readOnly);
}

function callRenderer(name, input, client) {
  const win = mcp.mainWin;
  if (!win || win.isDestroyed() || win.webContents.isLoading()) {
    return Promise.reject(new Error("Vector non è ancora pronto: riprova tra qualche secondo."));
  }
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      mcp.pending.delete(id);
      reject(new Error("Vector non ha risposto in tempo."));
    }, MCP_CALL_TIMEOUT_MS);
    mcp.pending.set(id, { resolve, reject, timer });
    win.webContents.send("mcp:call", { id, name, input, client });
  });
}

ipcMain.on("mcp:result", (_event, { id, ok, payload, error }) => {
  const pending = mcp.pending.get(id);
  if (!pending) return;
  mcp.pending.delete(id);
  clearTimeout(pending.timer);
  if (ok) pending.resolve(payload);
  else pending.reject(new Error(error ?? "Errore sconosciuto"));
});

ipcMain.on("mcp:register-tools", (_event, tools) => {
  mcp.tools = Array.isArray(tools) ? tools : [];
});

async function startServer() {
  if (mcp.server) return mcpStatus();
  const { startMcpHttpServer } = await import("./mcp-server.mjs");
  mcp.server = await startMcpHttpServer({
    port: MCP_PORT,
    token: ensureToken(),
    listTools: visibleTools,
    callTool: (name, input, client) => {
      const tool = mcp.tools.find((t) => t.name === name);
      if (!tool) throw new Error(`Strumento sconosciuto: ${name}`);
      if (!tool.readOnly && !mcp.writeEnabled) throw new Error("Le modifiche sono disattivate in Vector.");
      return callRenderer(name, input, client);
    },
  });
  notifyState();
  return mcpStatus();
}

async function stopServer() {
  stopTunnel();
  if (mcp.server) {
    const server = mcp.server;
    mcp.server = null;
    await server.close();
  }
  notifyState();
  return mcpStatus();
}

function lastLines(text) {
  return text.trim().split(/\r?\n/).slice(-3).join(" ");
}

function startTunnel() {
  if (!mcp.server) throw new Error("Avvia prima il server MCP.");
  if (mcp.tunnel) return mcpStatus();

  mcp.tunnelUrl = null;
  mcp.tunnelError = null;
  let output = "";
  const child = spawn("devtunnel", ["host", "-p", String(MCP_PORT), "--allow-anonymous"], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  mcp.tunnel = child;

  const onOutput = (chunk) => {
    output += chunk.toString();
    const match = output.match(DEVTUNNEL_URL_PATTERN);
    if (match && !mcp.tunnelUrl) {
      mcp.tunnelUrl = match[0].replace(/\/+$/, "");
      notifyState();
    }
  };
  child.stdout.on("data", onOutput);
  child.stderr.on("data", onOutput);

  child.on("error", (err) => {
    if (mcp.tunnel !== child) return;
    mcp.tunnel = null;
    mcp.tunnelError =
      err.code === "ENOENT" ? "devtunnel non trovato. Installa la CLI con: winget install Microsoft.devtunnel" : err.message;
    notifyState();
  });

  child.on("exit", (code) => {
    if (mcp.tunnel !== child) return;
    mcp.tunnel = null;
    mcp.tunnelUrl = null;
    if (code !== 0 && code !== null) mcp.tunnelError = lastLines(output) || `devtunnel terminato con codice ${code}`;
    notifyState();
  });

  notifyState();
  return mcpStatus();
}

function stopTunnel() {
  if (!mcp.tunnel) return mcpStatus();
  const child = mcp.tunnel;
  mcp.tunnel = null;
  mcp.tunnelUrl = null;
  child.kill();
  notifyState();
  return mcpStatus();
}

ipcMain.handle("mcp:status", () => mcpStatus());
ipcMain.handle("mcp:start", () => startServer());
ipcMain.handle("mcp:stop", () => stopServer());
ipcMain.handle("mcp:set-write", (_event, enabled) => {
  mcp.writeEnabled = enabled === true;
  notifyState();
  return mcpStatus();
});
ipcMain.handle("mcp:get-token", () => ensureToken());
ipcMain.handle("mcp:regenerate-token", async () => {
  const wasRunning = !!mcp.server;
  await stopServer();
  mcp.token = randomBytes(32).toString("base64url");
  storeToken(mcp.token);
  if (wasRunning) await startServer();
  return mcp.token;
});
ipcMain.handle("mcp:tunnel-start", () => startTunnel());
ipcMain.handle("mcp:tunnel-stop", () => stopTunnel());

ipcMain.handle("export-pdf", async (_event, body) => {
  try {
    validateRequestBody(body);
    return await renderDiagramPdf(body);
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new Error(err instanceof Error ? err.message : "Errore sconosciuto nella generazione del PDF.");
  }
});

app.whenReady().then(() => {
  const splash = createSplashWindow();
  createWindow(splash);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(createSplashWindow());
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
