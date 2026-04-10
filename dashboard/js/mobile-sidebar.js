/**
 * Mobile Sidebar Drawer - iPhone SE (375px) optimiert
 * Smooth animations, backdrop click, hamburger toggle
 */

class MobileSidebar {
    constructor() {
        this.sidebar = null;
        this.overlay = null;
        this.hamburger = null;
        this.isOpen = false;
        this.isAnimating = false;

        this.init();
    }

    init() {
        // Warten bis DOM ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    setup() {
        this.createElements();
        this.bindEvents();
    }

    createElements() {
        // Hamburger Menu Button
        this.hamburger = document.createElement('button');
        this.hamburger.className = 'hamburger-menu';
        this.hamburger.innerHTML = `
            <span></span>
            <span></span>
            <span></span>
        `;
        document.body.appendChild(this.hamburger);

        // Overlay für Backdrop
        this.overlay = document.createElement('div');
        this.overlay.className = 'sidebar-overlay';
        document.body.appendChild(this.overlay);

        // Sidebar (falls noch nicht vorhanden)
        this.sidebar = document.querySelector('.sidebar');
        if (!this.sidebar) {
            this.sidebar = document.createElement('div');
            this.sidebar.className = 'sidebar';
            document.body.appendChild(this.sidebar);
        }

        // Close Button in Sidebar
        let closeBtn = this.sidebar.querySelector('.close-btn');
        if (!closeBtn) {
            closeBtn = document.createElement('button');
            closeBtn.className = 'close-btn';
            closeBtn.innerHTML = '×';
            this.sidebar.appendChild(closeBtn);
        }
    }

    bindEvents() {
        // Hamburger Click
        this.hamburger.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggle();
        });

        // Overlay Click (Backdrop)
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.close();
            }
        });

        // Close Button
        const closeBtn = this.sidebar.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.close();
            });
        }

        // Swipe Gestures
        this.bindSwipeGestures();

        // Escape Key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });

        // Resize Handler
        window.addEventListener('resize', () => {
            if (window.innerWidth > 375) {
                this.close();
            }
        });
    }

    bindSwipeGestures() {
        let startX = null;
        let startY = null;
        let isVerticalSwipe = false;

        // Touch Start
        document.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;

            const touch = e.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            isVerticalSwipe = false;
        });

        // Touch Move
        document.addEventListener('touchmove', (e) => {
            if (!startX || !startY || e.touches.length !== 1) return;

            const touch = e.touches[0];
            const deltaX = touch.clientX - startX;
            const deltaY = touch.clientY - startY;

            // Check if it's a vertical swipe
            if (Math.abs(deltaY) > Math.abs(deltaX)) {
                isVerticalSwipe = true;
                return;
            }

            // Prevent default if horizontal swipe
            if (Math.abs(deltaX) > 10 && !isVerticalSwipe) {
                e.preventDefault();
            }
        }, { passive: false });

        // Touch End
        document.addEventListener('touchend', (e) => {
            if (!startX || !startY || isVerticalSwipe) {
                startX = null;
                startY = null;
                return;
            }

            const touch = e.changedTouches[0];
            const deltaX = touch.clientX - startX;
            const swipeThreshold = 50;

            // Swipe from left edge to open
            if (startX < 30 && deltaX > swipeThreshold && !this.isOpen) {
                this.open();
            }
            // Swipe left to close
            else if (deltaX < -swipeThreshold && this.isOpen) {
                this.close();
            }

            startX = null;
            startY = null;
        });
    }

    toggle() {
        if (this.isAnimating) return;

        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        if (this.isOpen || this.isAnimating) return;

        this.isAnimating = true;
        this.isOpen = true;

        // Add classes
        this.sidebar.classList.add('open');
        this.overlay.classList.add('active');
        this.hamburger.classList.add('active');
        document.body.classList.add('sidebar-open');

        // Prevent scrolling
        document.body.style.overflow = 'hidden';

        // Animation complete
        setTimeout(() => {
            this.isAnimating = false;
        }, 400);

        // Dispatch event
        document.dispatchEvent(new CustomEvent('sidebar-opened'));
    }

    close() {
        if (!this.isOpen || this.isAnimating) return;

        this.isAnimating = true;
        this.isOpen = false;

        // Remove classes
        this.sidebar.classList.remove('open');
        this.overlay.classList.remove('active');
        this.hamburger.classList.remove('active');
        document.body.classList.remove('sidebar-open');

        // Restore scrolling
        document.body.style.overflow = '';

        // Animation complete
        setTimeout(() => {
            this.isAnimating = false;
        }, 400);

        // Dispatch event
        document.dispatchEvent(new CustomEvent('sidebar-closed'));
    }

    isDrawerOpen() {
        return this.isOpen;
    }

    destroy() {
        if (this.hamburger && this.hamburger.parentNode) {
            this.hamburger.parentNode.removeChild(this.hamburger);
        }
        if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }

        document.body.classList.remove('sidebar-open');
        document.body.style.overflow = '';
    }
}

// Only initialize on mobile
function initMobileSidebar() {
    if (window.innerWidth <= 375) {
        window.mobileSidebar = new MobileSidebar();
    }
}

// Auto-initialize
document.addEventListener('DOMContentLoaded', initMobileSidebar);

// Re-check on resize
window.addEventListener('resize', () => {
    if (window.innerWidth > 375) {
        if (window.mobileSidebar) {
            window.mobileSidebar.destroy();
            window.mobileSidebar = null;
        }
    } else if (!window.mobileSidebar) {
        initMobileSidebar();
    }
});

// Export
window.MobileSidebar = MobileSidebar;