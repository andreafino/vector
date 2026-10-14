import type { DiagramFileV1 } from "./diagramFile";

// L'API File System Access (showOpenFilePicker/showSaveFilePicker) non è in TypeScript lib.dom
// di default in tutte le configurazioni: dichiarata qui al minimo indispensabile.
interface FileSystemFileHandleLike {
  createWritable(): Promise<{ write(data: BlobPart): Promise<void>; close(): Promise<void> }>;
  getFile(): Promise<File>;
}

declare global {
  interface Window {
    showOpenFilePicker?: (options?: { types?: { description: string; accept: Record<string, string[]> }[] }) => Promise<FileSystemFileHandleLike[]>;
    showSaveFilePicker?: (options?: { suggestedName?: string; types?: { description: string; accept: Record<string, string[]> }[] }) => Promise<FileSystemFileHandleLike>;
  }
}

const JSON_PICKER_TYPES = [{ description: "Diagramma Vector (JSON)", accept: { "application/json": [".json"] } }];

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

async function openViaInputFallback(): Promise<DiagramFileV1> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.style.display = "none";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      document.body.removeChild(input);
      if (!file) {
        reject(new DOMException("Nessun file selezionato.", "AbortError"));
        return;
      }
      file
        .text()
        .then((text) => resolve(JSON.parse(text) as DiagramFileV1))
        .catch(reject);
    });
    document.body.appendChild(input);
    input.click();
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadViaAnchor(data: DiagramFileV1): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  downloadBlob(blob, "architettura.json");
}

export async function openDiagramFile(): Promise<{ data: DiagramFileV1; handle?: FileSystemFileHandleLike }> {
  if (window.showOpenFilePicker) {
    const [handle] = await window.showOpenFilePicker({ types: JSON_PICKER_TYPES });
    const file = await handle.getFile();
    const data = JSON.parse(await file.text()) as DiagramFileV1;
    return { data, handle };
  }
  const data = await openViaInputFallback();
  return { data };
}

export async function saveDiagramFile(data: DiagramFileV1, handle?: FileSystemFileHandleLike): Promise<FileSystemFileHandleLike | undefined> {
  const content = JSON.stringify(data, null, 2);
  if (handle) {
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
    return handle;
  }
  if (window.showSaveFilePicker) {
    const newHandle = await window.showSaveFilePicker({ suggestedName: "architettura.json", types: JSON_PICKER_TYPES });
    const writable = await newHandle.createWritable();
    await writable.write(content);
    await writable.close();
    return newHandle;
  }
  downloadViaAnchor(data);
  return undefined;
}

export { isAbort };
export type { FileSystemFileHandleLike };
