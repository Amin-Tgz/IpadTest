export interface Diagnostics {
  info(event: string, detail?: unknown): void;
  error(event: string, detail?: unknown): void;
}

function format(detail: unknown): string {
  if (detail instanceof Error) return detail.message;
  if (typeof detail === "string") return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

export function createDiagnostics(root: HTMLElement): Diagnostics {
  void root;

  const write = (level: "INFO" | "ERROR", event: string, detail?: unknown): void => {
    const suffix = detail === undefined ? "" : ` — ${format(detail).slice(0, 360)}`;
    const line = `${new Date().toLocaleTimeString()} ${level} ${event}${suffix}`;
    if (level === "ERROR") console.error(`[line-pal] ${event}`, detail);
    else console.info(`[line-pal] ${event}`, detail ?? "");
  };

  return { info: (event, detail) => write("INFO", event, detail), error: (event, detail) => write("ERROR", event, detail) };
}
