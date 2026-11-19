import { projectRect, type Rect, type UiMode } from '../layout';

export type ActionVariant = 'primary' | 'secondary' | 'sound';

export interface ActionRegistration {
  /** Scene-unique stable id, matching the visual name (`playButton`, …). */
  id: string;
  label: string;
  accessibleLabel?: string;
  rect: Rect;
  visible?: boolean;
  enabled?: boolean;
  pressed?: boolean;
  variant?: ActionVariant;
  /** Compact-mode mount point. Defaults to the sidebar. */
  panelParent?: HTMLElement;
  onActivate: () => void;
  /** Existing synth unlock hook; DOM actions do not reach Phaser's listener. */
  onFirstGesture?: () => void;
  onPress?: () => void;
  onRelease?: () => void;
  onHover?: (hover: boolean) => void;
  onFocus?: (focused: boolean) => void;
}

export interface ActionHandle {
  readonly id: string;
  setLabel(label: string): void;
  setAccessibleLabel(label: string): void;
  setRect(rect: Rect): void;
  setVisible(visible: boolean): void;
  setEnabled(enabled: boolean): void;
  setPressed(pressed: boolean): void;
  setPanelParent(parent: HTMLElement): void;
  destroy(): void;
}

export interface DialogOptions {
  actionId: string;
  title: string;
  body: string;
  /** Optional decoration inserted above the heading. */
  art?: HTMLElement;
  /** Optional game-specific content inserted between body and action. */
  content?: HTMLElement;
}

interface Record {
  spec: ActionRegistration;
  button: HTMLButtonElement;
  visible: boolean;
  enabled: boolean;
  pressed: boolean | undefined;
  customAccessible: boolean;
  pointerFired: boolean;
  lastPointerAt: number;
  resetTimer: ReturnType<typeof setTimeout> | undefined;
  /** Set when a newer scene registers the same stable id. */
  replaced: boolean;
  destroy: () => void;
}

export interface UiActionLayerOptions {
  overlay: HTMLElement;
  sidebar: HTMLElement;
  getCanvas: () => HTMLCanvasElement | null;
  mode: () => UiMode;
}

const FINE_POINTER = '(hover: hover) and (pointer: fine)';

/**
 * The single DOM activation path for adopted game actions. In normal layout
 * the real buttons are transparent over the canvas; in compact layout the same
 * button is visibly placed in the sidebar or a dialog. Never two copies.
 */
export class UiActionLayer {
  private readonly overlay: HTMLElement;
  private readonly sidebar: HTMLElement;
  private readonly getCanvas: () => HTMLCanvasElement | null;
  private readonly modeOf: () => UiMode;
  private readonly records = new Map<string, Record>();
  private modeValue: UiMode;
  private dialog: { element: HTMLElement; panel: HTMLElement; actionId: string; keydown: (event: KeyboardEvent) => void } | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private mutationObserver: MutationObserver | null = null;
  private layoutFrame: number | null = null;
  private readonly onViewportChange = (): void => this.scheduleLayout();

  constructor(options: UiActionLayerOptions) {
    this.overlay = options.overlay;
    this.sidebar = options.sidebar;
    this.getCanvas = options.getCanvas;
    this.modeOf = options.mode;
    this.modeValue = options.mode();
    window.addEventListener('resize', this.onViewportChange);
    window.addEventListener('orientationchange', this.onViewportChange);
    window.visualViewport?.addEventListener('resize', this.onViewportChange);
    window.visualViewport?.addEventListener('scroll', this.onViewportChange);
  }

  /** Watch the canvas rectangle so projections follow FIT margin changes. */
  attach(canvas: HTMLCanvasElement): void {
    if (this.canvas === canvas) {
      this.scheduleLayout();
      return;
    }
    this.resizeObserver?.disconnect();
    this.mutationObserver?.disconnect();
    this.canvas = canvas;
    this.resizeObserver = new ResizeObserver(this.onViewportChange);
    this.resizeObserver.observe(canvas);
    // Phaser moves the canvas with style margins on FIT refresh; ResizeObserver
    // does not fire for position-only changes.
    this.mutationObserver = new MutationObserver(this.onViewportChange);
    this.mutationObserver.observe(canvas, { attributes: true, attributeFilter: ['style', 'width', 'height'] });
    this.scheduleLayout();
  }

  /** Coalesce projection work onto the next layout frame. */
  scheduleLayout(): void {
    if (this.layoutFrame !== null) cancelAnimationFrame(this.layoutFrame);
    this.layoutFrame = requestAnimationFrame(() => {
      this.layoutFrame = null;
      this.layout();
    });
  }

  register(spec: ActionRegistration): ActionHandle {
    // Scene transitions can overlap briefly (e.g. a manager-driven start
    // before the old scene's shutdown). Replace a stale action with the same
    // stable id rather than leaving two focusable copies or throwing.
    const existing = this.records.get(spec.id);
    if (existing) {
      existing.replaced = true;
      if (this.dialog?.actionId === spec.id) this.closeDialog();
      existing.destroy();
      this.records.delete(spec.id);
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ui-action';
    button.dataset.actionId = spec.id;
    button.textContent = spec.label;
    button.setAttribute('aria-label', spec.accessibleLabel ?? spec.label);

    const record: Record = {
      spec,
      button,
      visible: spec.visible ?? true,
      enabled: spec.enabled ?? true,
      pressed: spec.pressed,
      customAccessible: spec.accessibleLabel !== undefined,
      pointerFired: false,
      lastPointerAt: 0,
      resetTimer: undefined,
      replaced: false,
      destroy: () => undefined,
    };

    const activate = (): void => {
      if (!record.visible || !record.enabled || button.disabled) return;
      record.spec.onFirstGesture?.();
      record.spec.onActivate();
    };

    const onPointerDown = (event: PointerEvent): void => {
      record.lastPointerAt = Date.now();
      // A second simultaneous touch must not activate, and its synthesized
      // click is suppressed by the recent-pointer guard below.
      if (!event.isPrimary || event.button !== 0 || !record.visible || !record.enabled) return;
      record.pointerFired = true;
      record.spec.onPress?.();
      activate();
    };
    const onPointerUp = (): void => {
      record.lastPointerAt = Date.now();
      record.spec.onRelease?.();
      // The synthesized click runs before this timer; if it never arrives the
      // flag is cleared so a later keyboard activation still works.
      if (record.resetTimer !== undefined) clearTimeout(record.resetTimer);
      record.resetTimer = setTimeout(() => {
        record.pointerFired = false;
      }, 0);
    };
    const onPointerCancel = (): void => {
      record.lastPointerAt = Date.now();
      record.pointerFired = false;
      record.spec.onRelease?.();
    };
    const onClick = (): void => {
      if (record.pointerFired) {
        record.pointerFired = false;
        return;
      }
      // Pointer-generated clicks are never a second action; keyboard and
      // assistive clicks have no recent pointer event.
      if (Date.now() - record.lastPointerAt < 600) return;
      activate();
    };
    const onPointerEnter = (): void => {
      if (window.matchMedia(FINE_POINTER).matches) record.spec.onHover?.(true);
    };
    const onPointerLeave = (): void => {
      record.spec.onHover?.(false);
      record.spec.onRelease?.();
    };
    const onFocus = (): void => record.spec.onFocus?.(true);
    const onBlur = (): void => record.spec.onFocus?.(false);
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      if (!event.repeat) activate();
    };

    button.addEventListener('pointerdown', onPointerDown);
    button.addEventListener('pointerup', onPointerUp);
    button.addEventListener('pointercancel', onPointerCancel);
    button.addEventListener('click', onClick);
    button.addEventListener('pointerenter', onPointerEnter);
    button.addEventListener('pointerleave', onPointerLeave);
    button.addEventListener('focus', onFocus);
    button.addEventListener('blur', onBlur);
    button.addEventListener('keydown', onKeyDown);

    record.destroy = () => {
      if (record.resetTimer !== undefined) clearTimeout(record.resetTimer);
      button.removeEventListener('pointerdown', onPointerDown);
      button.removeEventListener('pointerup', onPointerUp);
      button.removeEventListener('pointercancel', onPointerCancel);
      button.removeEventListener('click', onClick);
      button.removeEventListener('pointerenter', onPointerEnter);
      button.removeEventListener('pointerleave', onPointerLeave);
      button.removeEventListener('focus', onFocus);
      button.removeEventListener('blur', onBlur);
      button.removeEventListener('keydown', onKeyDown);
      button.remove();
    };

    this.records.set(spec.id, record);
    this.applyButtonMode(record);
    this.applyState(record);
    this.scheduleLayout();
    return this.handle(record);
  }

  setMode(mode: UiMode): void {
    if (mode === this.modeValue) return;
    this.modeValue = mode;
    if (this.dialog) this.dialog.element.dataset.mode = mode;
    for (const record of this.records.values()) this.applyButtonMode(record);
    this.scheduleLayout();
  }

  /** Recompute projected rectangles from the live canvas bounds. */
  layout(): void {
    const canvas = this.getCanvas();
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    for (const record of this.records.values()) {
      const button = record.button;
      if (this.modeValue !== 'normal') {
        button.style.left = '';
        button.style.top = '';
        button.style.width = '';
        button.style.height = '';
        continue;
      }
      const projected = projectRect(record.spec.rect, rect);
      button.style.left = `${projected.left}px`;
      button.style.top = `${projected.top}px`;
      button.style.width = `${projected.width}px`;
      button.style.height = `${projected.height}px`;
    }
  }

  openDialog({ actionId, title, body, art, content }: DialogOptions): void {
    this.closeDialog();
    const record = this.records.get(actionId);
    if (!record) throw new Error(`Unknown dialog action ${actionId}`);
    const element = document.createElement('div');
    element.className = 'ui-dialog';
    element.dataset.mode = this.modeValue;
    const scrim = document.createElement('div');
    scrim.className = 'ui-dialog__scrim';
    const panel = document.createElement('div');
    panel.className = 'ui-dialog__panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    const headingId = `ui-dialog-title-${actionId}`;
    panel.setAttribute('aria-labelledby', headingId);
    const heading = document.createElement('h2');
    heading.className = 'ui-dialog__heading';
    heading.id = headingId;
    heading.textContent = title;
    const text = document.createElement('p');
    text.className = 'ui-dialog__body';
    text.textContent = body;
    if (art) panel.append(art);
    panel.append(heading, text);
    if (content) panel.append(content);
    element.append(scrim, panel);
    this.overlay.appendChild(element);

    const keydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') return;
      event.preventDefault();
      const focusable = panel.querySelectorAll<HTMLElement>('button:not([disabled])');
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) last.focus();
      else if (!event.shiftKey && document.activeElement === last) first.focus();
      else record.button.focus({ preventScroll: true });
    };
    element.addEventListener('keydown', keydown);
    this.dialog = { element, panel, actionId, keydown };
    for (const other of this.records.values()) {
      other.button.inert = other !== record;
    }
    panel.appendChild(record.button);
    this.applyButtonMode(record);
    record.button.focus({ preventScroll: true });
    // A mouse click's compatibility events can move focus to BODY after the
    // pointerdown callback. Re-assert the dialog action after that sequence.
    const focusAction = (): void => {
      if (this.dialog?.actionId === actionId) record.button.focus({ preventScroll: true });
    };
    queueMicrotask(focusAction);
    requestAnimationFrame(focusAction);
    this.scheduleLayout();
  }

  closeDialog(): void {
    if (!this.dialog) return;
    const { element, actionId, keydown } = this.dialog;
    element.removeEventListener('keydown', keydown);
    const record = this.records.get(actionId);
    element.remove();
    for (const other of this.records.values()) other.button.inert = false;
    if (record) {
      this.applyButtonMode(record);
      this.scheduleLayout();
    }
    this.dialog = null;
  }

  focus(actionId: string): void {
    this.records.get(actionId)?.button.focus({ preventScroll: true });
  }

  destroy(): void {
    this.closeDialog();
    window.removeEventListener('resize', this.onViewportChange);
    window.removeEventListener('orientationchange', this.onViewportChange);
    window.visualViewport?.removeEventListener('resize', this.onViewportChange);
    window.visualViewport?.removeEventListener('scroll', this.onViewportChange);
    this.resizeObserver?.disconnect();
    this.mutationObserver?.disconnect();
    this.resizeObserver = null;
    this.mutationObserver = null;
    if (this.layoutFrame !== null) cancelAnimationFrame(this.layoutFrame);
    this.layoutFrame = null;
    this.canvas = null;
    for (const record of this.records.values()) record.destroy();
    this.records.clear();
  }

  private handle(record: Record): ActionHandle {
    const layer = this;
    return {
      id: record.spec.id,
      setLabel(label: string): void {
        if (record.replaced) return;
        record.spec.label = label;
        record.button.textContent = label;
        if (!record.customAccessible) record.button.setAttribute('aria-label', label);
      },
      setAccessibleLabel(label: string): void {
        if (record.replaced) return;
        record.customAccessible = true;
        record.button.setAttribute('aria-label', label);
      },
      setRect(rect: Rect): void {
        if (record.replaced) return;
        record.spec.rect = rect;
        layer.scheduleLayout();
      },
      setVisible(visible: boolean): void {
        if (record.replaced) return;
        record.visible = visible;
        layer.applyState(record);
        if (!visible && layer.dialog?.actionId === record.spec.id) layer.closeDialog();
      },
      setEnabled(enabled: boolean): void {
        if (record.replaced) return;
        record.enabled = enabled;
        layer.applyState(record);
      },
      setPressed(pressed: boolean): void {
        if (record.replaced) return;
        record.pressed = pressed;
        layer.applyState(record);
      },
      setPanelParent(parent: HTMLElement): void {
        if (record.replaced) return;
        record.spec.panelParent = parent;
        if (layer.modeValue === 'compact') layer.applyButtonMode(record);
      },
      destroy(): void {
        if (record.replaced) return;
        if (layer.dialog?.actionId === record.spec.id) layer.closeDialog();
        record.destroy();
        if (layer.records.get(record.spec.id) === record) layer.records.delete(record.spec.id);
      },
    };
  }

  private applyState(record: Record): void {
    const { button } = record;
    button.hidden = !record.visible;
    button.disabled = !record.enabled;
    button.tabIndex = record.visible && record.enabled ? 0 : -1;
    if (record.pressed === undefined) button.removeAttribute('aria-pressed');
    else button.setAttribute('aria-pressed', record.pressed ? 'true' : 'false');
  }

  private applyButtonMode(record: Record): void {
    const { button, spec } = record;
    button.classList.remove('ui-action--overlay', 'ui-action--panel', 'ui-action--primary', 'ui-action--secondary', 'ui-action--sound');
    button.classList.add(`ui-action--${spec.variant ?? 'primary'}`);
    if (this.dialog?.actionId === spec.id) {
      if (this.modeValue === 'compact') button.classList.add('ui-action--panel');
      else button.classList.add('ui-action--overlay');
      if (button.parentElement !== this.dialog.panel) this.dialog.panel.appendChild(button);
      return;
    }
    if (this.modeValue === 'compact') {
      button.classList.add('ui-action--panel');
      const parent = spec.panelParent ?? this.sidebar;
      if (button.parentElement !== parent) parent.appendChild(button);
    } else {
      button.classList.add('ui-action--overlay');
      if (button.parentElement !== this.overlay) this.overlay.appendChild(button);
    }
  }
}
