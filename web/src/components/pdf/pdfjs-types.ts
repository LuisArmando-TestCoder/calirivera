/**
 * Tipos mínimos de pdf.js que usa el lector (la librería se carga por URL desde /vendor, sin paquete npm).
 */
export interface Viewport {
  width: number;
  height: number;
}
export interface RenderTask {
  promise: Promise<void>;
  cancel(): void;
}
export interface Page {
  getViewport(o: { scale: number }): Viewport;
  render(o: { canvas: HTMLCanvasElement; viewport: Viewport; background?: string }): RenderTask;
  cleanup(): void;
}
export interface Doc {
  numPages: number;
  getPage(n: number): Promise<Page>;
}
export interface LoadingTask {
  promise: Promise<Doc>;
  onProgress: ((p: { loaded: number; total: number }) => void) | null;
  destroy(): Promise<void>;
}
export declare const GlobalWorkerOptions: { workerSrc: string };
export declare function getDocument(o: Record<string, unknown>): LoadingTask;
