/**
 * Video Thumbnail Generator - Erstes Frame extrahieren
 * @author Marlene - Video/Medien Team BLUN
 */

class VideoThumbnailGenerator {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.defaultWidth = 320;
        this.defaultHeight = 180;
    }

    /**
     * Erstelle Thumbnail aus Video erste Frame
     * @param {File|string} videoSource - Video File oder URL
     * @param {Object} options - Thumbnail Optionen
     * @returns {Promise<string>} Base64 Thumbnail
     */
    async generateThumbnail(videoSource, options = {}) {
        const {
            width = this.defaultWidth,
            height = this.defaultHeight,
            quality = 0.8,
            seekTime = 0.1
        } = options;

        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.crossOrigin = 'anonymous';
            video.muted = true;
            video.playsInline = true;

            video.onloadedmetadata = () => {
                // Canvas Größe setzen
                this.canvas.width = width;
                this.canvas.height = height;

                video.currentTime = seekTime;
            };

            video.onseeked = () => {
                try {
                    // Video Frame auf Canvas zeichnen
                    this.ctx.drawImage(video, 0, 0, width, height);

                    // Canvas zu Base64 konvertieren
                    const thumbnail = this.canvas.toDataURL('image/jpeg', quality);

                    // Cleanup
                    video.src = '';
                    video.remove();

                    resolve(thumbnail);
                } catch (error) {
                    reject(new Error(`Thumbnail Generation failed: ${error.message}`));
                }
            };

            video.onerror = () => {
                reject(new Error('Video konnte nicht geladen werden'));
            };

            // Video Source setzen
            if (videoSource instanceof File) {
                video.src = URL.createObjectURL(videoSource);
            } else {
                video.src = videoSource;
            }

            video.load();
        });
    }

    /**
     * Batch Thumbnail Generation
     * @param {Array} videoSources - Array von Videos
     * @param {Object} options - Thumbnail Optionen
     * @returns {Promise<Array>} Array von Thumbnails
     */
    async generateBatch(videoSources, options = {}) {
        const thumbnails = [];

        for (const source of videoSources) {
            try {
                const thumbnail = await this.generateThumbnail(source, options);
                thumbnails.push({
                    source: source instanceof File ? source.name : source,
                    thumbnail,
                    success: true
                });
            } catch (error) {
                thumbnails.push({
                    source: source instanceof File ? source.name : source,
                    error: error.message,
                    success: false
                });
            }
        }

        return thumbnails;
    }

    /**
     * Video Thumbnail Preview Komponente
     * @param {File|string} videoSource - Video Source
     * @param {Object} config - Konfiguration
     * @returns {HTMLElement} Thumbnail Element
     */
    async createThumbnailPreview(videoSource, config = {}) {
        const {
            containerClass = 'video-thumbnail-preview',
            showDuration = true,
            showFilename = true,
            width = 160,
            height = 90
        } = config;

        const container = document.createElement('div');
        container.className = containerClass;
        container.style.cssText = `
            position: relative;
            width: ${width}px;
            height: ${height}px;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            cursor: pointer;
            transition: transform 0.2s ease;
        `;

        try {
            // Thumbnail generieren
            const thumbnailData = await this.generateThumbnail(videoSource, { width, height });

            // Thumbnail Image
            const img = document.createElement('img');
            img.src = thumbnailData;
            img.style.cssText = `
                width: 100%;
                height: 100%;
                object-fit: cover;
            `;

            // Play Button Overlay
            const playButton = document.createElement('div');
            playButton.innerHTML = '▶';
            playButton.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0,0,0,0.7);
                color: white;
                width: 40px;
                height: 40px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
                padding-left: 2px;
            `;

            container.appendChild(img);
            container.appendChild(playButton);

            // Filename Label
            if (showFilename && videoSource instanceof File) {
                const filename = document.createElement('div');
                filename.textContent = videoSource.name;
                filename.style.cssText = `
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    background: linear-gradient(transparent, rgba(0,0,0,0.8));
                    color: white;
                    padding: 8px 6px 4px;
                    font-size: 11px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                `;
                container.appendChild(filename);
            }

            // Hover Effect
            container.onmouseenter = () => {
                container.style.transform = 'scale(1.05)';
            };
            container.onmouseleave = () => {
                container.style.transform = 'scale(1)';
            };

        } catch (error) {
            // Error State
            container.innerHTML = `
                <div style="
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    background: #f0f0f0;
                    color: #666;
                    font-size: 12px;
                    text-align: center;
                    padding: 8px;
                ">
                    ⚠️<br>Thumbnail<br>Error
                </div>
            `;
        }

        return container;
    }
}

// Video Thumbnail Drop Zone
class VideoThumbnailDropZone {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.querySelector(container) : container;
        this.generator = new VideoThumbnailGenerator();
        this.options = {
            acceptedTypes: ['video/mp4', 'video/webm', 'video/mov', 'video/avi'],
            maxFiles: 10,
            thumbnailSize: { width: 160, height: 90 },
            ...options
        };

        this.init();
    }

    init() {
        this.setupDropZone();
        this.createUI();
    }

    setupDropZone() {
        this.container.style.cssText += `
            border: 2px dashed #ddd;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            transition: border-color 0.3s ease;
            min-height: 200px;
        `;

        this.container.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.container.style.borderColor = '#007bff';
        });

        this.container.addEventListener('dragleave', () => {
            this.container.style.borderColor = '#ddd';
        });

        this.container.addEventListener('drop', (e) => {
            e.preventDefault();
            this.container.style.borderColor = '#ddd';
            this.handleDrop(e);
        });
    }

    createUI() {
        this.container.innerHTML = `
            <div class="drop-zone-content">
                <div class="drop-icon" style="font-size: 48px; margin-bottom: 16px;">🎬</div>
                <div class="drop-text" style="font-size: 16px; color: #666; margin-bottom: 16px;">
                    Videos hierher ziehen oder
                </div>
                <button class="browse-btn" style="
                    background: #007bff;
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                ">Dateien auswählen</button>
                <input type="file" class="file-input" accept="video/*" multiple style="display: none;">
                <div class="thumbnails-grid" style="
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
                    gap: 16px;
                    margin-top: 20px;
                "></div>
            </div>
        `;

        // Event Listeners
        const browseBtn = this.container.querySelector('.browse-btn');
        const fileInput = this.container.querySelector('.file-input');

        browseBtn.onclick = () => fileInput.click();
        fileInput.onchange = (e) => this.handleFiles(e.target.files);
    }

    async handleDrop(e) {
        const files = Array.from(e.dataTransfer.files)
            .filter(file => this.options.acceptedTypes.includes(file.type))
            .slice(0, this.options.maxFiles);

        if (files.length > 0) {
            await this.handleFiles(files);
        }
    }

    async handleFiles(files) {
        const grid = this.container.querySelector('.thumbnails-grid');

        for (const file of files) {
            const thumbnail = await this.generator.createThumbnailPreview(
                file,
                this.options.thumbnailSize
            );

            // Click Handler für Video abspielen
            thumbnail.onclick = () => {
                this.playVideo(file);
            };

            grid.appendChild(thumbnail);
        }
    }

    playVideo(file) {
        // Video Player Modal
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        `;

        const video = document.createElement('video');
        video.src = URL.createObjectURL(file);
        video.controls = true;
        video.autoplay = true;
        video.style.maxWidth = '90%';
        video.style.maxHeight = '90%';

        modal.appendChild(video);
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.remove();
                URL.revokeObjectURL(video.src);
            }
        };

        document.body.appendChild(modal);
    }
}

// Export für Dashboard Integration
window.VideoThumbnailGenerator = VideoThumbnailGenerator;
window.VideoThumbnailDropZone = VideoThumbnailDropZone;

// Auto-Init für Dashboard
document.addEventListener('DOMContentLoaded', () => {
    // Suche nach Video Thumbnail Containern
    const thumbnailContainers = document.querySelectorAll('[data-video-thumbnails]');

    thumbnailContainers.forEach(container => {
        new VideoThumbnailDropZone(container);
    });
});