const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, callback) {
  const listener = (_event, message) => callback(message);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("vectorDesktop", {
  exportPdf: (payload) => ipcRenderer.invoke("export-pdf", payload),
  mcp: {
    status: () => ipcRenderer.invoke("mcp:status"),
    start: () => ipcRenderer.invoke("mcp:start"),
    stop: () => ipcRenderer.invoke("mcp:stop"),
    setWriteEnabled: (enabled) => ipcRenderer.invoke("mcp:set-write", enabled),
    getToken: () => ipcRenderer.invoke("mcp:get-token"),
    regenerateToken: () => ipcRenderer.invoke("mcp:regenerate-token"),
    tunnelStart: () => ipcRenderer.invoke("mcp:tunnel-start"),
    tunnelStop: () => ipcRenderer.invoke("mcp:tunnel-stop"),
    registerTools: (tools) => ipcRenderer.send("mcp:register-tools", tools),
    onCall: (callback) => subscribe("mcp:call", callback),
    onState: (callback) => subscribe("mcp:state", callback),
    respond: (id, ok, payload, error) => ipcRenderer.send("mcp:result", { id, ok, payload, error }),
  },
});
