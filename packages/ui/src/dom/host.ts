import { selectMode, type UiMode } from '../layout';
import { UiActionLayer } from './actions';

export interface GameLike {
  canvas: HTMLCanvasElement;
  scale: { refresh(): void };
}

interface StartupApi {
  ready(): void;
  fail(): void;
}

declare global {
  interface Window {
    /** Installed by the pre-bundle inline startup guard in each game HTML. */
    __UI_STARTUP__?: StartupApi;
  }
}

export interface UiHostOptions {
  title: string;
  loadingLabel?: string;
}

type ModeListener = (mode: UiMode) => void;

const SLOW_LOAD_MS = 8000;

/**
 * Owns the page shell: safe-area stage, compact sidebar, overlay, startup
 * status and the live region. Created once from `main.ts` before Phaser boots.
 */
export class UiHost {
  readonly host: HTMLElement;
  readonly stage: HTMLElement;
  readonly sidebar: HTMLElement;
  readonly overlay: HTMLElement;
  private readonly startup: HTMLElement | null;
  private readonly startupStatus: HTMLElement | null;
  private readonly startupReload: HTMLButtonElement | null;
  private readonly startupTrack: HTMLElement | null;
  private readonly probe: HTMLElement;
  private readonly live: HTMLElement;
  private readonly listeners = new Set<ModeListener>();
  private readonly resizeObserver: ResizeObserver;
  private actionLayer: UiActionLayer | null = null;
  private game: GameLike | null = null;
  private ready = false;
  private slowTimer: ReturnType<typeof setTimeout> | undefined;
  private currentMode: UiMode = 'normal';

  constructor(options: UiHostOptions) {
    this.host = required('ui-host');
    this.stage = required('ui-stage');
    this.sidebar = required('ui-sidebar');
    this.overlay = required('ui-overlay');
    this.startup = document.getElementById('ui-startup');
    this.startupStatus = document.getElementById('ui-startup-status');
    this.startupReload = document.getElementById('ui-startup-reload') as HTMLButtonElement | null;
    this.startupTrack = document.getElementById('ui-startup-track');
    this.probe = ensureProbe();
    this.live = ensureLiveRegion();

    this.host.setAttribute('aria-busy', 'true');
    this.host.dataset.uiMode = this.currentMode;
    // The inline guard owns reload and the navigation-clock slow notice when
    // present. The host fallback covers pages without that guard.
    if (!window.__UI_STARTUP__) {
      this.startupReload?.addEventListener('click', () => location.reload());
      this.slowTimer = setTimeout(() => {
        if (this.ready) return;
        if (this.startupStatus) this.startupStatus.textContent = 'Still loading…';
        if (this.startupReload) this.startupReload.hidden = false;
      }, SLOW_LOAD_MS);
    }

    this.resizeObserver = new ResizeObserver(() => this.refreshMode());
    this.resizeObserver.observe(this.probe);
    window.addEventListener('resize', this.refreshMode);
    window.addEventListener('orientationchange', this.refreshMode);

    window.addEventListener('error', this.onWindowError);
    window.addEventListener('unhandledrejection', this.onWindowError);

    this.refreshMode();
  }

  get mode(): UiMode {
    return this.currentMode;
  }

  get canvas(): HTMLCanvasElement | null {
    return this.game?.canvas ?? null;
  }

  attachGame(game: GameLike): void {
    this.game = game;
    this.actionLayer?.attach(game.canvas);
    this.actionLayer?.scheduleLayout();
  }

  actions(): UiActionLayer {
    if (!this.actionLayer) {
      this.actionLayer = new UiActionLayer({
        overlay: this.overlay,
        sidebar: this.sidebar,
        getCanvas: () => this.game?.canvas ?? null,
        mode: () => this.currentMode,
      });
      if (this.game) this.actionLayer.attach(this.game.canvas);
    }
    return this.actionLayer;
  }

  onModeChange(listener: ModeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  markReady(): void {
    if (this.ready) return;
    this.ready = true;
    window.__UI_STARTUP__?.ready();
    if (this.slowTimer !== undefined) clearTimeout(this.slowTimer);
    this.host.setAttribute('aria-busy', 'false');
    if (this.startupStatus) {
      this.startupStatus.removeAttribute('role');
      this.startupStatus.removeAttribute('aria-live');
      this.startupStatus.removeAttribute('aria-atomic');
    }
    if (this.startup) this.startup.hidden = true;
  }

  showError(): void {
    this.ready = true;
    window.__UI_STARTUP__?.fail();
    if (this.slowTimer !== undefined) clearTimeout(this.slowTimer);
    if (this.startupStatus) {
      this.startupStatus.textContent = 'The game couldn’t load.';
      this.startupStatus.setAttribute('role', 'status');
      this.startupStatus.setAttribute('aria-live', 'polite');
      this.startupStatus.setAttribute('aria-atomic', 'true');
    }
    if (this.startupReload) this.startupReload.hidden = false;
    if (this.startupTrack) this.startupTrack.hidden = true;
    this.host.setAttribute('aria-busy', 'false');
  }

  announce(text: string): void {
    this.live.textContent = '';
    // Force a fresh announcement for repeated text.
    requestAnimationFrame(() => {
      this.live.textContent = text;
    });
  }

  destroy(): void {
    this.resizeObserver.disconnect();
    window.removeEventListener('resize', this.refreshMode);
    window.removeEventListener('orientationchange', this.refreshMode);
    window.removeEventListener('error', this.onWindowError);
    window.removeEventListener('unhandledrejection', this.onWindowError);
    if (this.slowTimer !== undefined) clearTimeout(this.slowTimer);
    this.actionLayer?.destroy();
    this.listeners.clear();
  }

  private readonly onWindowError = (): void => {
    if (!this.ready) this.showError();
  };

  private readonly refreshMode = (): void => {
    const rect = this.probe.getBoundingClientRect();
    const next = selectMode(rect.width, rect.height);
    if (next !== this.currentMode) {
      this.currentMode = next;
      this.host.dataset.uiMode = next;
      this.actionLayer?.setMode(next);
      this.listeners.forEach((listener) => listener(next));
    }
    // Recalculate FIT bounds, then project actions from the settled canvas
    // rect on the next layout frame. No delayed timer is involved.
    this.actionLayer?.scheduleLayout();
    requestAnimationFrame(() => {
      this.game?.scale.refresh();
      this.actionLayer?.scheduleLayout();
    });
  };
}

const required = (id: string): HTMLElement => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing UI host element #${id}`);
  return element;
};

const ensureProbe = (): HTMLElement => {
  const existing = document.querySelector<HTMLElement>('.ui-safe-probe');
  if (existing) return existing;
  const probe = document.createElement('div');
  probe.className = 'ui-safe-probe';
  probe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(probe);
  return probe;
};

const ensureLiveRegion = (): HTMLElement => {
  const existing = document.querySelector<HTMLElement>('.ui-live');
  if (existing) return existing;
  const live = document.createElement('div');
  live.className = 'ui-live sr-only';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  document.body.appendChild(live);
  return live;
};

let currentHost: UiHost | null = null;

export const createUiHost = (options: UiHostOptions): UiHost => {
  currentHost?.destroy();
  currentHost = new UiHost(options);
  return currentHost;
};

export const getUiHost = (): UiHost | null => currentHost;
