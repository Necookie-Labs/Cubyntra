/**
 * Cubyntra - WebGL Context Loss Guard
 * Necookie Labs (c) 2026
 *
 * A browser may take the GPU context away (driver reset, too many contexts, a phone backgrounding
 * the tab). The canvas then fires `webglcontextlost`; calling preventDefault() on it is what tells
 * the browser we want the context back, and `webglcontextrestored` follows when it is.
 *
 * This guard only turns those events into two callbacks, at most once per loss, so the logic is
 * testable with any EventTarget. The engine pauses its loop on loss and rebuilds on restore.
 */

export interface ContextLossHandlers {
  onLost(): void;
  onRestored(): void;
}

type EventSource = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

export class ContextLossGuard {
  private lost = false;
  private readonly canvas: EventSource;
  private readonly handlers: ContextLossHandlers;

  constructor(canvas: EventSource, handlers: ContextLossHandlers) {
    this.canvas = canvas;
    this.handlers = handlers;
    canvas.addEventListener('webglcontextlost', this.handleLost);
    canvas.addEventListener('webglcontextrestored', this.handleRestored);
  }

  public isLost(): boolean {
    return this.lost;
  }

  private handleLost = (event: Event): void => {
    // Without this the browser will not try to restore the context.
    event.preventDefault();
    if (this.lost) return;
    this.lost = true;
    this.handlers.onLost();
  };

  private handleRestored = (): void => {
    if (!this.lost) return;
    this.lost = false;
    this.handlers.onRestored();
  };

  public dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.handleLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleRestored);
  }
}
