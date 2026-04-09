/**
 * Mobile Touch Handlers für Canvas
 * Pinch-to-zoom und Double-tap Support
 */

class TouchHandlers {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Touch state
        this.touches = new Map();
        this.lastTouchTime = 0;
        this.doubleTapTimeout = 300;
        this.isZooming = false;

        // Zoom state
        this.scale = 1;
        this.minScale = 0.5;
        this.maxScale = 3;
        this.translateX = 0;
        this.translateY = 0;

        // Bind events
        this.bindEvents();
    }

    bindEvents() {
        // Prevent default touch behaviors
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handleTouchStart(e);
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.handleTouchMove(e);
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.handleTouchEnd(e);
        }, { passive: false });

        this.canvas.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            this.handleTouchEnd(e);
        }, { passive: false });

        // Mouse fallback for desktop
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.handleWheel(e);
        }, { passive: false });
    }

    handleTouchStart(event) {
        const now = Date.now();
        const touches = event.changedTouches;

        // Update touch map
        for (let touch of touches) {
            this.touches.set(touch.identifier, {
                x: touch.clientX,
                y: touch.clientY,
                startX: touch.clientX,
                startY: touch.clientY,
                timestamp: now
            });
        }

        // Single touch - check for double tap
        if (this.touches.size === 1 && touches.length === 1) {
            const timeDelta = now - this.lastTouchTime;

            if (timeDelta < this.doubleTapTimeout) {
                this.handleDoubleTap(touches[0]);
                return;
            }

            this.lastTouchTime = now;
        }

        // Multi-touch - prepare for zoom
        if (this.touches.size >= 2) {
            this.isZooming = true;
            this.lastDistance = this.getTouchDistance();
        }
    }

    handleTouchMove(event) {
        const touches = event.changedTouches;

        // Update touch positions
        for (let touch of touches) {
            if (this.touches.has(touch.identifier)) {
                this.touches.set(touch.identifier, {
                    ...this.touches.get(touch.identifier),
                    x: touch.clientX,
                    y: touch.clientY
                });
            }
        }

        // Handle zoom with two fingers
        if (this.touches.size >= 2 && this.isZooming) {
            this.handlePinchZoom();
        }
        // Handle pan with one finger (only if not zoomed out completely)
        else if (this.touches.size === 1 && this.scale > this.minScale) {
            this.handlePan();
        }
    }

    handleTouchEnd(event) {
        const touches = event.changedTouches;

        // Remove ended touches
        for (let touch of touches) {
            this.touches.delete(touch.identifier);
        }

        // Stop zooming if no more touches
        if (this.touches.size < 2) {
            this.isZooming = false;
        }

        // Constrain zoom and pan
        this.constrainTransform();
    }

    handlePinchZoom() {
        const touchArray = Array.from(this.touches.values());
        if (touchArray.length < 2) return;

        const currentDistance = this.getTouchDistance();
        if (!this.lastDistance) {
            this.lastDistance = currentDistance;
            return;
        }

        // Calculate zoom delta
        const deltaDistance = currentDistance - this.lastDistance;
        const zoomFactor = 1 + (deltaDistance * 0.01);

        // Get center point of pinch
        const centerX = (touchArray[0].x + touchArray[1].x) / 2;
        const centerY = (touchArray[0].y + touchArray[1].y) / 2;

        // Apply zoom
        this.zoomAtPoint(centerX, centerY, zoomFactor);

        this.lastDistance = currentDistance;
    }

    handlePan() {
        const touchArray = Array.from(this.touches.values());
        const touch = touchArray[0];

        const deltaX = touch.x - touch.startX;
        const deltaY = touch.y - touch.startY;

        this.translateX += deltaX * 0.8;
        this.translateY += deltaY * 0.8;

        // Update start position for continuous pan
        this.touches.set(Array.from(this.touches.keys())[0], {
            ...touch,
            startX: touch.x,
            startY: touch.y
        });

        this.applyTransform();
    }

    handleDoubleTap(touch) {
        const rect = this.canvas.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;

        if (this.scale > 1.2) {
            // Zoom out to fit
            this.resetZoom();
        } else {
            // Zoom in at tap point
            this.zoomAtPoint(x, y, 2.0);
        }
    }

    handleWheel(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
        this.zoomAtPoint(x, y, zoomFactor);
    }

    zoomAtPoint(centerX, centerY, factor) {
        const newScale = this.scale * factor;

        // Constrain scale
        if (newScale < this.minScale || newScale > this.maxScale) {
            return;
        }

        // Calculate new translation to keep zoom point centered
        const deltaScale = newScale - this.scale;
        this.translateX -= (centerX - this.translateX) * (deltaScale / this.scale);
        this.translateY -= (centerY - this.translateY) * (deltaScale / this.scale);

        this.scale = newScale;
        this.applyTransform();
    }

    resetZoom() {
        this.scale = 1;
        this.translateX = 0;
        this.translateY = 0;
        this.applyTransform();
    }

    constrainTransform() {
        // Constrain scale
        this.scale = Math.max(this.minScale, Math.min(this.maxScale, this.scale));

        // Constrain translation based on scale
        const maxTranslateX = this.canvas.width * (this.scale - 1) / 2;
        const maxTranslateY = this.canvas.height * (this.scale - 1) / 2;

        this.translateX = Math.max(-maxTranslateX, Math.min(maxTranslateX, this.translateX));
        this.translateY = Math.max(-maxTranslateY, Math.min(maxTranslateY, this.translateY));

        this.applyTransform();
    }

    applyTransform() {
        const transform = `scale(${this.scale}) translate(${this.translateX}px, ${this.translateY}px)`;
        this.canvas.style.transform = transform;
        this.canvas.style.transformOrigin = '0 0';
    }

    getTouchDistance() {
        const touchArray = Array.from(this.touches.values());
        if (touchArray.length < 2) return 0;

        const dx = touchArray[1].x - touchArray[0].x;
        const dy = touchArray[1].y - touchArray[0].y;

        return Math.sqrt(dx * dx + dy * dy);
    }

    // Public API
    getTransform() {
        return {
            scale: this.scale,
            translateX: this.translateX,
            translateY: this.translateY
        };
    }

    setTransform(scale, translateX, translateY) {
        this.scale = scale || 1;
        this.translateX = translateX || 0;
        this.translateY = translateY || 0;
        this.constrainTransform();
    }

    destroy() {
        // Remove all event listeners
        this.canvas.removeEventListener('touchstart', this.handleTouchStart);
        this.canvas.removeEventListener('touchmove', this.handleTouchMove);
        this.canvas.removeEventListener('touchend', this.handleTouchEnd);
        this.canvas.removeEventListener('touchcancel', this.handleTouchEnd);
        this.canvas.removeEventListener('wheel', this.handleWheel);

        // Reset transform
        this.canvas.style.transform = '';
    }
}

// Auto-initialize for canvases with touch-enabled class
document.addEventListener('DOMContentLoaded', () => {
    const touchCanvases = document.querySelectorAll('canvas.touch-enabled');

    touchCanvases.forEach(canvas => {
        canvas.touchHandlers = new TouchHandlers(canvas);
    });
});

// Export for manual initialization
window.TouchHandlers = TouchHandlers;