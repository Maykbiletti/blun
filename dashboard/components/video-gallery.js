// Video Gallery Component - Marlene 2026-04-09
// Grid-Layout mit Thumbnail-Vorschau, Hover-Play-Preview und Click-to-Fullscreen
// Optimiert für Seedance Clips und Social Reels

import { VideoThumbnailGenerator } from './video-thumbnail.js';

export class VideoGallery {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.querySelector(container) : container;
        this.options = {
            columns: options.columns || 'auto-fit',
            minWidth: options.minWidth || 280,
            maxWidth: options.maxWidth || 400,
            gap: options.gap || 16,
            aspectRatio: options.aspectRatio || '16/9',
            hoverPlayDelay: options.hoverPlayDelay || 300,
            autoplay: options.autoplay !== false,
            muted: options.muted !== false,
            ...options
        };
        this.videos = [];
        this.thumbnailGenerator = new VideoThumbnailGenerator();
        this.currentlyPlaying = null;
        this.hoverTimeout = null;
        this.fullscreenVideo = null;

        this.init();
    }

    init() {
        this.setupContainer();
        this.setupFullscreenModal();
        this.setupEventListeners();
    }

    setupContainer() {
        this.container.className = 'video-gallery';
        this.container.style.cssText = `
            display: grid;
            grid-template-columns: repeat(${this.options.columns}, minmax(${this.options.minWidth}px, ${this.options.maxWidth}px));
            gap: ${this.options.gap}px;
            padding: ${this.options.gap}px;
            justify-content: center;
            max-width: 100%;
            overflow-x: auto;
        `;
    }

    setupFullscreenModal() {
        // Fullscreen Modal für Click-to-Fullscreen
        this.modal = document.createElement('div');
        this.modal.className = 'video-gallery-modal';
        this.modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.95);
            display: none;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            cursor: pointer;
        `;

        this.modalVideo = document.createElement('video');
        this.modalVideo.style.cssText = `
            max-width: 90vw;
            max-height: 90vh;
            cursor: auto;
        `;
        this.modalVideo.controls = true;
        this.modalVideo.autoplay = true;

        this.modal.appendChild(this.modalVideo);
        document.body.appendChild(this.modal);
    }

    setupEventListeners() {
        // ESC zum Fullscreen schließen
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.style.display !== 'none') {
                this.closeFullscreen();
            }
        });

        // Click außerhalb Video schließt Fullscreen
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.closeFullscreen();
            }
        });
    }

    async addVideo(videoFile, metadata = {}) {
        const videoItem = {
            file: videoFile,
            url: URL.createObjectURL(videoFile),
            metadata: {
                title: metadata.title || videoFile.name.replace(/\.[^/.]+$/, ""),
                duration: metadata.duration || null,
                type: this.detectVideoType(videoFile.name),
                uploadDate: metadata.uploadDate || new Date(),
                ...metadata
            }
        };

        this.videos.push(videoItem);
        await this.renderVideoItem(videoItem);
        return videoItem;
    }

    detectVideoType(filename) {
        const name = filename.toLowerCase();
        if (name.includes('reel') || name.includes('story') || name.includes('social')) {
            return 'social';
        }
        if (name.includes('seedance') || name.includes('dance') || name.includes('music')) {
            return 'seedance';
        }
        if (name.includes('ad') || name.includes('commercial')) {
            return 'ad';
        }
        return 'clip';
    }

    async renderVideoItem(videoItem) {
        const item = document.createElement('div');
        item.className = 'video-gallery-item';
        item.style.cssText = `
            position: relative;
            aspect-ratio: ${this.options.aspectRatio};
            border-radius: 12px;
            overflow: hidden;
            cursor: pointer;
            background: #1a1a1a;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        `;

        // Hover Animation
        item.addEventListener('mouseenter', () => {
            item.style.transform = 'scale(1.02)';
            item.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.4)';
            this.startHoverPreview(item, videoItem);
        });

        item.addEventListener('mouseleave', () => {
            item.style.transform = 'scale(1)';
            item.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
            this.stopHoverPreview(item);
        });

        // Click to Fullscreen
        item.addEventListener('click', () => {
            this.openFullscreen(videoItem);
        });

        // Thumbnail generieren
        try {
            const thumbnail = await this.thumbnailGenerator.generateFromVideo(videoItem.file);

            const thumbnailImg = document.createElement('img');
            thumbnailImg.style.cssText = `
                width: 100%;
                height: 100%;
                object-fit: cover;
                transition: opacity 0.3s ease;
            `;
            thumbnailImg.src = thumbnail;
            item.appendChild(thumbnailImg);

        } catch (error) {
            console.error('Thumbnail generation failed:', error);
            // Fallback: Erste Frame mit Video Element
            const fallbackVideo = document.createElement('video');
            fallbackVideo.style.cssText = `
                width: 100%;
                height: 100%;
                object-fit: cover;
            `;
            fallbackVideo.src = videoItem.url;
            fallbackVideo.muted = true;
            item.appendChild(fallbackVideo);
        }

        // Video Type Badge
        const typeBadge = this.createTypeBadge(videoItem.metadata.type);
        item.appendChild(typeBadge);

        // Play Icon Overlay
        const playIcon = this.createPlayIcon();
        item.appendChild(playIcon);

        // Video Info Overlay
        const infoOverlay = this.createInfoOverlay(videoItem);
        item.appendChild(infoOverlay);

        // Preview Video (hidden initially)
        const previewVideo = document.createElement('video');
        previewVideo.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            opacity: 0;
            transition: opacity 0.3s ease;
            pointer-events: none;
        `;
        previewVideo.src = videoItem.url;
        previewVideo.muted = true;
        previewVideo.loop = true;
        item.appendChild(previewVideo);

        videoItem.element = item;
        videoItem.previewVideo = previewVideo;

        this.container.appendChild(item);
    }

    createTypeBadge(type) {
        const badge = document.createElement('div');
        const typeConfig = {
            'social': { label: 'REEL', color: '#E91E63' },
            'seedance': { label: 'DANCE', color: '#FF9800' },
            'ad': { label: 'AD', color: '#4CAF50' },
            'clip': { label: 'CLIP', color: '#2196F3' }
        };

        const config = typeConfig[type] || typeConfig.clip;

        badge.style.cssText = `
            position: absolute;
            top: 8px;
            left: 8px;
            background: ${config.color};
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: bold;
            letter-spacing: 0.5px;
            z-index: 2;
        `;
        badge.textContent = config.label;
        return badge;
    }

    createPlayIcon() {
        const playIcon = document.createElement('div');
        playIcon.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 60px;
            height: 60px;
            background: rgba(255, 255, 255, 0.9);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            z-index: 2;
            transition: all 0.3s ease;
        `;
        playIcon.innerHTML = '▶️';
        return playIcon;
    }

    createInfoOverlay(videoItem) {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
            color: white;
            padding: 20px 12px 12px;
            z-index: 2;
        `;

        const title = document.createElement('div');
        title.style.cssText = `
            font-weight: bold;
            font-size: 14px;
            margin-bottom: 4px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        `;
        title.textContent = videoItem.metadata.title;

        const duration = document.createElement('div');
        duration.style.cssText = `
            font-size: 12px;
            opacity: 0.8;
        `;
        duration.textContent = this.formatDuration(videoItem.metadata.duration);

        overlay.appendChild(title);
        overlay.appendChild(duration);
        return overlay;
    }

    startHoverPreview(item, videoItem) {
        if (this.hoverTimeout) {
            clearTimeout(this.hoverTimeout);
        }

        this.hoverTimeout = setTimeout(() => {
            if (this.currentlyPlaying && this.currentlyPlaying !== videoItem.previewVideo) {
                this.currentlyPlaying.pause();
                this.currentlyPlaying.parentElement.querySelector('img').style.opacity = '1';
            }

            videoItem.previewVideo.style.opacity = '1';
            videoItem.previewVideo.currentTime = 0;
            videoItem.previewVideo.play().catch(e => {
                console.log('Preview autoplay prevented:', e);
            });

            // Hide thumbnail
            const thumbnail = item.querySelector('img');
            if (thumbnail) {
                thumbnail.style.opacity = '0';
            }

            // Hide play icon during preview
            const playIcon = item.querySelector('div[style*="border-radius: 50%"]');
            if (playIcon) {
                playIcon.style.opacity = '0';
            }

            this.currentlyPlaying = videoItem.previewVideo;
        }, this.options.hoverPlayDelay);
    }

    stopHoverPreview(item) {
        if (this.hoverTimeout) {
            clearTimeout(this.hoverTimeout);
            this.hoverTimeout = null;
        }

        const previewVideo = item.querySelector('video');
        const thumbnail = item.querySelector('img');
        const playIcon = item.querySelector('div[style*="border-radius: 50%"]');

        if (previewVideo) {
            previewVideo.pause();
            previewVideo.style.opacity = '0';
        }

        if (thumbnail) {
            thumbnail.style.opacity = '1';
        }

        if (playIcon) {
            playIcon.style.opacity = '1';
        }

        if (this.currentlyPlaying === previewVideo) {
            this.currentlyPlaying = null;
        }
    }

    openFullscreen(videoItem) {
        this.fullscreenVideo = videoItem;
        this.modalVideo.src = videoItem.url;
        this.modalVideo.currentTime = 0;
        this.modal.style.display = 'flex';

        // Stop any preview playback
        if (this.currentlyPlaying) {
            this.currentlyPlaying.pause();
        }

        document.body.style.overflow = 'hidden';
    }

    closeFullscreen() {
        this.modal.style.display = 'none';
        this.modalVideo.pause();
        this.modalVideo.src = '';
        this.fullscreenVideo = null;
        document.body.style.overflow = '';
    }

    formatDuration(duration) {
        if (!duration) return '';
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    // Bulk Upload für mehrere Videos
    async addVideos(files) {
        const results = [];
        for (const file of files) {
            if (file.type.startsWith('video/')) {
                try {
                    const result = await this.addVideo(file);
                    results.push(result);
                } catch (error) {
                    console.error('Failed to add video:', file.name, error);
                }
            }
        }
        return results;
    }

    // Filter Videos nach Type
    filterByType(type) {
        this.videos.forEach(videoItem => {
            const display = !type || videoItem.metadata.type === type ? 'block' : 'none';
            videoItem.element.style.display = display;
        });
    }

    // Search in Video Titles
    search(query) {
        const searchQuery = query.toLowerCase().trim();
        this.videos.forEach(videoItem => {
            const matches = !searchQuery ||
                           videoItem.metadata.title.toLowerCase().includes(searchQuery);
            videoItem.element.style.display = matches ? 'block' : 'none';
        });
    }

    // Clear Gallery
    clear() {
        this.videos.forEach(videoItem => {
            URL.revokeObjectURL(videoItem.url);
            videoItem.element.remove();
        });
        this.videos = [];
    }

    // Get Gallery Stats
    getStats() {
        const types = {};
        let totalDuration = 0;

        this.videos.forEach(video => {
            types[video.metadata.type] = (types[video.metadata.type] || 0) + 1;
            if (video.metadata.duration) {
                totalDuration += video.metadata.duration;
            }
        });

        return {
            total: this.videos.length,
            types,
            totalDuration: Math.round(totalDuration),
            formattedDuration: this.formatDuration(totalDuration)
        };
    }

    destroy() {
        this.clear();
        if (this.modal && this.modal.parentNode) {
            this.modal.parentNode.removeChild(this.modal);
        }
        if (this.thumbnailGenerator.destroy) {
            this.thumbnailGenerator.destroy();
        }
    }
}

// Drag & Drop Integration für Video Gallery
export class VideoGalleryDropZone extends VideoGallery {
    constructor(container, options = {}) {
        super(container, options);
        this.setupDropZone();
    }

    setupDropZone() {
        this.container.style.border = '2px dashed transparent';
        this.container.style.transition = 'border-color 0.3s ease';

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this.container.addEventListener(eventName, this.preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            this.container.addEventListener(eventName, () => {
                this.container.style.borderColor = '#FF9800';
                this.container.style.backgroundColor = 'rgba(255, 152, 0, 0.1)';
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            this.container.addEventListener(eventName, () => {
                this.container.style.borderColor = 'transparent';
                this.container.style.backgroundColor = 'transparent';
            }, false);
        });

        this.container.addEventListener('drop', this.handleDrop.bind(this), false);
    }

    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    async handleDrop(e) {
        const dt = e.dataTransfer;
        const files = [...dt.files];

        const videoFiles = files.filter(file => file.type.startsWith('video/'));
        if (videoFiles.length > 0) {
            await this.addVideos(videoFiles);
        }
    }
}