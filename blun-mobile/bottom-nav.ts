/**
 * BLUN Mobile Bottom Navigation
 * iOS/Android Thumb-Zone optimiert
 * 60fps Haptic Feedback + Touch-Response
 * Safe-Area kompatibel
 */

interface BottomNavConfig {
  /** Nav-Items mit Icons und Labels */
  items: NavItem[];
  /** Aktiver Index (0-based) */
  activeIndex?: number;
  /** Callback bei Tab-Wechsel */
  onNavigate?: (index: number, item: NavItem) => void;
  /** Haptic Feedback aktivieren (iOS/Android) */
  hapticEnabled?: boolean;
  /** Container-Element */
  container?: HTMLElement;
}

interface NavItem {
  id: string;
  label: string;
  icon: string;
  badge?: number;
  disabled?: boolean;
}

interface TouchState {
  isPressed: boolean;
  pressedIndex: number | null;
  startTime: number;
  startX: number;
  startY: number;
}

export class BottomNav {
  private config: Required<BottomNavConfig>;
  private element: HTMLElement | null = null;
  private touchState: TouchState = {
    isPressed: false,
    pressedIndex: null,
    startTime: 0,
    startX: 0,
    startY: 0,
  };

  constructor(config: BottomNavConfig) {
    this.config = {
      activeIndex: 0,
      hapticEnabled: true,
      container: document.body,
      onNavigate: () => {},
      ...config,
    };

    this.init();
  }

  private init() {
    this.createNavElement();
    this.setupEventListeners();
    this.render();
  }

  private createNavElement(): void {
    this.element = document.createElement('nav');
    this.element.className = 'bottom-nav';
    this.element.setAttribute('role', 'navigation');
    this.element.setAttribute('aria-label', 'Haupt-Navigation');

    this.config.container.appendChild(this.element);
  }

  private render(): void {
    if (!this.element) return;

    this.element.innerHTML = `
      <div class="bottom-nav-background"></div>
      <div class="bottom-nav-items">
        ${this.config.items.map((item, index) => this.renderItem(item, index)).join('')}
      </div>
    `;
  }

  private renderItem(item: NavItem, index: number): string {
    const isActive = index === this.config.activeIndex;
    const isDisabled = item.disabled;
    const hasBadge = item.badge && item.badge > 0;

    return `
      <button
        class="bottom-nav-item ${isActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''}"
        data-index="${index}"
        data-item-id="${item.id}"
        role="tab"
        aria-selected="${isActive}"
        aria-disabled="${isDisabled}"
        ${isDisabled ? 'disabled' : ''}
      >
        <div class="nav-item-ripple"></div>
        <div class="nav-item-content">
          <span class="nav-item-icon" aria-hidden="true">${item.icon}</span>
          <span class="nav-item-label">${item.label}</span>
          ${hasBadge ? `<span class="nav-item-badge" aria-label="${item.badge} neue">${item.badge}</span>` : ''}
        </div>
        <div class="nav-item-indicator"></div>
      </button>
    `;
  }

  private setupEventListeners(): void {
    if (!this.element) return;

    // Touch Events für optimierte Response
    this.element.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
    this.element.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
    this.element.addEventListener('touchend', this.onTouchEnd.bind(this), { passive: true });
    this.element.addEventListener('touchcancel', this.onTouchCancel.bind(this), { passive: true });

    // Click Fallback für Desktop/Pointer
    this.element.addEventListener('click', this.onClick.bind(this), { passive: true });
  }

  private onTouchStart(e: TouchEvent): void {
    const touch = e.touches[0];
    const target = this.getNavItemFromTouch(touch);

    if (!target) return;

    const index = parseInt(target.dataset.index || '-1');
    if (index === -1 || this.config.items[index]?.disabled) return;

    this.touchState = {
      isPressed: true,
      pressedIndex: index,
      startTime: performance.now(),
      startX: touch.clientX,
      startY: touch.clientY,
    };

    // Sofortige visuelle Response
    this.setPressed(target, true);

    // Haptic Feedback (iOS/Android)
    this.triggerHaptic('light');

    e.preventDefault(); // Verhindert Zoom/Scroll
  }

  private onTouchMove(e: TouchEvent): void {
    if (!this.touchState.isPressed) return;

    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - this.touchState.startX);
    const deltaY = Math.abs(touch.clientY - this.touchState.startY);

    // Wenn zu weit bewegt -> Cancel
    if (deltaX > 20 || deltaY > 20) {
      this.cancelTouch();
    }
  }

  private onTouchEnd(e: TouchEvent): void {
    if (!this.touchState.isPressed || this.touchState.pressedIndex === null) {
      this.cancelTouch();
      return;
    }

    const duration = performance.now() - this.touchState.startTime;
    const index = this.touchState.pressedIndex;

    // Nur bei kurzen Taps (< 500ms) navigieren
    if (duration < 500) {
      this.navigateToIndex(index);
      this.triggerHaptic('medium');
    }

    this.cancelTouch();
  }

  private onTouchCancel(): void {
    this.cancelTouch();
  }

  private onClick(e: Event): void {
    // Fallback für Desktop/Pointer Events
    const target = e.target as HTMLElement;
    const navItem = target.closest('.bottom-nav-item') as HTMLButtonElement;

    if (!navItem) return;

    const index = parseInt(navItem.dataset.index || '-1');
    if (index !== -1 && !this.config.items[index]?.disabled) {
      this.navigateToIndex(index);
    }
  }

  private getNavItemFromTouch(touch: Touch): HTMLButtonElement | null {
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    return element?.closest('.bottom-nav-item') as HTMLButtonElement || null;
  }

  private setPressed(element: HTMLElement, pressed: boolean): void {
    element.classList.toggle('pressed', pressed);
  }

  private cancelTouch(): void {
    if (this.touchState.pressedIndex !== null && this.element) {
      const pressedItem = this.element.querySelector(`[data-index="${this.touchState.pressedIndex}"]`) as HTMLElement;
      if (pressedItem) {
        this.setPressed(pressedItem, false);
      }
    }

    this.touchState = {
      isPressed: false,
      pressedIndex: null,
      startTime: 0,
      startX: 0,
      startY: 0,
    };
  }

  private navigateToIndex(index: number): void {
    if (index === this.config.activeIndex) return;

    const item = this.config.items[index];
    if (!item || item.disabled) return;

    this.config.activeIndex = index;
    this.render();
    this.config.onNavigate(index, item);
  }

  private triggerHaptic(type: 'light' | 'medium' | 'heavy'): void {
    if (!this.config.hapticEnabled) return;

    // iOS Haptic Feedback
    if ('navigator' in window && 'vibrate' in navigator) {
      const patterns = {
        light: [10],
        medium: [20],
        heavy: [30, 10, 20]
      };
      navigator.vibrate(patterns[type]);
    }

    // Web Haptic API (falls verfügbar)
    // @ts-ignore - Experimental API
    if (window.navigator?.vibrate) {
      const intensity = type === 'light' ? 0.3 : type === 'medium' ? 0.6 : 1.0;
      // @ts-ignore
      window.navigator.vibrate(intensity * 100);
    }
  }

  // --- Public API ---

  public setActive(index: number): void {
    this.navigateToIndex(index);
  }

  public updateItem(index: number, updates: Partial<NavItem>): void {
    if (index < 0 || index >= this.config.items.length) return;

    this.config.items[index] = { ...this.config.items[index], ...updates };
    this.render();
  }

  public setBadge(index: number, count: number): void {
    this.updateItem(index, { badge: count });
  }

  public destroy(): void {
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
  }
}

// --- Default Nav Items für BLUN ---
export const defaultNavItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'agents', label: 'Agents', icon: '🤖' },
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'canvas', label: 'Canvas', icon: '🎨' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];