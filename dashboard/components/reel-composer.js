// Reel Composer - Social Media Clip Editor
// Marlene - Video Production Team 🎬

class ReelComposer {
    constructor(container) {
        this.container = container;
        this.clips = [];
        this.currentAspectRatio = '9:16'; // TikTok/Instagram Reels default
        this.totalDuration = 0;
        this.maxDuration = 30; // 30 sec for social media
        this.draggedClip = null;

        this.aspectRatios = {
            '9:16': { width: 270, height: 480, label: 'Reels/TikTok' },
            '1:1': { width: 400, height: 400, label: 'Instagram Post' },
            '16:9': { width: 480, height: 270, label: 'YouTube Shorts' }
        };

        this.init();
    }

    init() {
        this.container.innerHTML = this.renderHTML();
        this.attachEventListeners();
        this.updatePreview();
    }

    renderHTML() {
        return `
            <div class="reel-composer">
                <div class="composer-header">
                    <h2>🎬 Social Reel Composer</h2>
                    <div class="aspect-ratio-switcher">
                        ${Object.entries(this.aspectRatios).map(([ratio, config]) =>
                            `<button class="aspect-btn ${ratio === this.currentAspectRatio ? 'active' : ''}"
                                     data-ratio="${ratio}">
                                <div class="ratio-preview" style="aspect-ratio: ${config.width}/${config.height}"></div>
                                <span>${ratio}</span>
                                <small>${config.label}</small>
                             </button>`
                        ).join('')}
                    </div>
                </div>

                <div class="composer-workspace">
                    <div class="preview-container">
                        <div class="video-preview" id="videoPreview">
                            <div class="preview-frame" style="aspect-ratio: ${this.aspectRatios[this.currentAspectRatio].width}/${this.aspectRatios[this.currentAspectRatio].height}">
                                <div class="preview-content">
                                    <div class="preview-placeholder">
                                        🎥 Reel Vorschau
                                        <div class="aspect-label">${this.currentAspectRatio}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="timeline-controls">
                            <div class="duration-info">
                                <span class="current-duration">${this.totalDuration.toFixed(1)}s</span>
                                <span class="max-duration">/ ${this.maxDuration}s</span>
                                <div class="duration-bar">
                                    <div class="duration-fill" style="width: ${(this.totalDuration / this.maxDuration) * 100}%"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="clip-library">
                        <h3>📹 Clip Bibliothek</h3>
                        <div class="library-grid" id="clipLibrary">
                            ${this.renderClipLibrary()}
                        </div>

                        <div class="upload-zone">
                            <input type="file" id="clipUpload" accept="video/*" multiple style="display: none;">
                            <label for="clipUpload" class="upload-btn">
                                📤 Clips Hochladen
                            </label>
                        </div>
                    </div>
                </div>

                <div class="timeline-editor">
                    <h3>✂️ Timeline Editor</h3>
                    <div class="timeline-container" id="timeline">
                        <div class="timeline-track" ondrop="drop(event)" ondragover="allowDrop(event)">
                            ${this.renderTimeline()}
                        </div>
                    </div>

                    <div class="export-controls">
                        <button class="export-btn" onclick="reelComposer.exportReel()">
                            🚀 Reel Exportieren
                        </button>
                    </div>
                </div>
            </div>

            <style>
                .reel-composer {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: #1a1a1a;
                    color: #ffffff;
                    padding: 20px;
                    border-radius: 12px;
                    max-width: 1200px;
                    margin: 0 auto;
                }

                .composer-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 30px;
                    padding-bottom: 20px;
                    border-bottom: 1px solid #333;
                }

                .composer-header h2 {
                    margin: 0;
                    font-size: 24px;
                    font-weight: 600;
                }

                .aspect-ratio-switcher {
                    display: flex;
                    gap: 10px;
                }

                .aspect-btn {
                    background: #2a2a2a;
                    border: 2px solid #444;
                    border-radius: 8px;
                    padding: 12px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    text-align: center;
                    color: #ccc;
                    min-width: 90px;
                }

                .aspect-btn.active {
                    border-color: #ff6b6b;
                    background: #ff6b6b15;
                    color: #ff6b6b;
                }

                .aspect-btn:hover {
                    border-color: #666;
                }

                .ratio-preview {
                    width: 40px;
                    height: auto;
                    background: #444;
                    border-radius: 4px;
                    margin: 0 auto 8px;
                    border: 1px solid #666;
                }

                .aspect-btn span {
                    display: block;
                    font-weight: 600;
                    margin-bottom: 4px;
                }

                .aspect-btn small {
                    font-size: 11px;
                    opacity: 0.7;
                }

                .composer-workspace {
                    display: grid;
                    grid-template-columns: 1fr 300px;
                    gap: 30px;
                    margin-bottom: 30px;
                }

                .preview-container {
                    background: #2a2a2a;
                    border-radius: 12px;
                    padding: 20px;
                }

                .video-preview {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    margin-bottom: 20px;
                }

                .preview-frame {
                    background: #000;
                    border-radius: 8px;
                    overflow: hidden;
                    max-width: 300px;
                    width: 100%;
                    border: 2px solid #444;
                }

                .preview-content {
                    width: 100%;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 200px;
                }

                .preview-placeholder {
                    text-align: center;
                    color: #666;
                    font-size: 18px;
                    font-weight: 500;
                }

                .aspect-label {
                    font-size: 14px;
                    margin-top: 8px;
                    color: #ff6b6b;
                }

                .timeline-controls {
                    background: #333;
                    border-radius: 8px;
                    padding: 15px;
                }

                .duration-info {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 10px;
                }

                .current-duration {
                    font-weight: 600;
                    color: #ff6b6b;
                }

                .max-duration {
                    color: #888;
                }

                .duration-bar {
                    flex: 1;
                    height: 6px;
                    background: #444;
                    border-radius: 3px;
                    overflow: hidden;
                }

                .duration-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #ff6b6b, #ffa500);
                    transition: width 0.3s ease;
                }

                .clip-library {
                    background: #2a2a2a;
                    border-radius: 12px;
                    padding: 20px;
                }

                .clip-library h3 {
                    margin: 0 0 15px 0;
                    font-size: 16px;
                    font-weight: 600;
                }

                .library-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px;
                    margin-bottom: 20px;
                }

                .library-clip {
                    background: #333;
                    border-radius: 6px;
                    padding: 10px;
                    cursor: grab;
                    transition: all 0.2s ease;
                    border: 1px solid #444;
                    text-align: center;
                }

                .library-clip:hover {
                    border-color: #ff6b6b;
                    transform: translateY(-2px);
                }

                .library-clip:active {
                    cursor: grabbing;
                }

                .clip-thumbnail {
                    width: 100%;
                    height: 60px;
                    background: #444;
                    border-radius: 4px;
                    margin-bottom: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 24px;
                }

                .clip-name {
                    font-size: 12px;
                    font-weight: 500;
                    margin-bottom: 4px;
                }

                .clip-duration {
                    font-size: 11px;
                    color: #888;
                }

                .upload-zone {
                    border: 2px dashed #444;
                    border-radius: 8px;
                    padding: 20px;
                    text-align: center;
                }

                .upload-btn {
                    background: #ff6b6b;
                    color: white;
                    padding: 10px 20px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 500;
                    transition: background 0.2s ease;
                }

                .upload-btn:hover {
                    background: #ff5252;
                }

                .timeline-editor {
                    background: #2a2a2a;
                    border-radius: 12px;
                    padding: 20px;
                }

                .timeline-editor h3 {
                    margin: 0 0 15px 0;
                    font-size: 16px;
                    font-weight: 600;
                }

                .timeline-container {
                    background: #1a1a1a;
                    border-radius: 8px;
                    padding: 20px;
                    min-height: 100px;
                    margin-bottom: 20px;
                }

                .timeline-track {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    min-height: 80px;
                    padding: 10px;
                    border: 2px dashed #444;
                    border-radius: 6px;
                    position: relative;
                }

                .timeline-track.drag-over {
                    border-color: #ff6b6b;
                    background: #ff6b6b10;
                }

                .timeline-clip {
                    background: linear-gradient(135deg, #ff6b6b, #ffa500);
                    border-radius: 6px;
                    padding: 10px;
                    min-width: 80px;
                    position: relative;
                    cursor: pointer;
                    border: 2px solid #ff6b6b;
                }

                .timeline-clip-name {
                    font-size: 12px;
                    font-weight: 600;
                    margin-bottom: 4px;
                    color: white;
                }

                .timeline-clip-duration {
                    font-size: 11px;
                    opacity: 0.9;
                    color: white;
                }

                .trim-handle {
                    position: absolute;
                    top: 0;
                    bottom: 0;
                    width: 8px;
                    background: rgba(255, 255, 255, 0.3);
                    cursor: ew-resize;
                    transition: background 0.2s ease;
                }

                .trim-handle.left {
                    left: 0;
                    border-radius: 6px 0 0 6px;
                }

                .trim-handle.right {
                    right: 0;
                    border-radius: 0 6px 6px 0;
                }

                .trim-handle:hover {
                    background: rgba(255, 255, 255, 0.6);
                }

                .export-controls {
                    text-align: center;
                }

                .export-btn {
                    background: linear-gradient(135deg, #ff6b6b, #ffa500);
                    color: white;
                    border: none;
                    padding: 15px 30px;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: transform 0.2s ease;
                }

                .export-btn:hover {
                    transform: translateY(-2px);
                }

                .timeline-empty {
                    text-align: center;
                    color: #666;
                    padding: 30px;
                    font-style: italic;
                }
            </style>
        `;
    }

    renderClipLibrary() {
        const sampleClips = [
            { name: 'Intro Hook', duration: 3.2, emoji: '🎯' },
            { name: 'Product Shot', duration: 5.1, emoji: '📱' },
            { name: 'Testimonial', duration: 4.8, emoji: '💬' },
            { name: 'CTA Ending', duration: 2.5, emoji: '🚀' }
        ];

        return sampleClips.map((clip, index) => `
            <div class="library-clip" draggable="true" data-clip-id="${index}">
                <div class="clip-thumbnail">${clip.emoji}</div>
                <div class="clip-name">${clip.name}</div>
                <div class="clip-duration">${clip.duration}s</div>
            </div>
        `).join('');
    }

    renderTimeline() {
        if (this.clips.length === 0) {
            return '<div class="timeline-empty">🎬 Ziehe Clips hierher um dein Reel zu erstellen</div>';
        }

        return this.clips.map((clip, index) => `
            <div class="timeline-clip" data-clip-index="${index}">
                <div class="trim-handle left" onmousedown="reelComposer.startTrim(event, ${index}, 'left')"></div>
                <div class="timeline-clip-name">${clip.name}</div>
                <div class="timeline-clip-duration">${clip.duration.toFixed(1)}s</div>
                <div class="trim-handle right" onmousedown="reelComposer.startTrim(event, ${index}, 'right')"></div>
            </div>
        `).join('');
    }

    attachEventListeners() {
        // Aspect Ratio Switcher
        this.container.addEventListener('click', (e) => {
            if (e.target.closest('.aspect-btn')) {
                const ratio = e.target.closest('.aspect-btn').dataset.ratio;
                this.switchAspectRatio(ratio);
            }
        });

        // Drag and Drop
        this.container.addEventListener('dragstart', (e) => {
            if (e.target.closest('.library-clip')) {
                this.draggedClip = e.target.closest('.library-clip').dataset.clipId;
                e.dataTransfer.effectAllowed = 'copy';
            }
        });

        this.container.addEventListener('dragover', (e) => {
            if (e.target.closest('.timeline-track')) {
                e.preventDefault();
                e.target.closest('.timeline-track').classList.add('drag-over');
            }
        });

        this.container.addEventListener('dragleave', (e) => {
            if (e.target.closest('.timeline-track')) {
                e.target.closest('.timeline-track').classList.remove('drag-over');
            }
        });

        this.container.addEventListener('drop', (e) => {
            if (e.target.closest('.timeline-track')) {
                e.preventDefault();
                e.target.closest('.timeline-track').classList.remove('drag-over');
                this.addClipToTimeline(this.draggedClip);
                this.draggedClip = null;
            }
        });

        // File Upload
        const fileInput = this.container.querySelector('#clipUpload');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                this.handleFileUpload(e.target.files);
            });
        }
    }

    switchAspectRatio(ratio) {
        this.currentAspectRatio = ratio;

        // Update active button
        this.container.querySelectorAll('.aspect-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.ratio === ratio);
        });

        // Update preview frame
        const previewFrame = this.container.querySelector('.preview-frame');
        if (previewFrame) {
            const config = this.aspectRatios[ratio];
            previewFrame.style.aspectRatio = `${config.width}/${config.height}`;
        }

        // Update aspect label
        const aspectLabel = this.container.querySelector('.aspect-label');
        if (aspectLabel) {
            aspectLabel.textContent = ratio;
        }

        this.updatePreview();
    }

    addClipToTimeline(clipId) {
        const sampleClips = [
            { name: 'Intro Hook', duration: 3.2, emoji: '🎯' },
            { name: 'Product Shot', duration: 5.1, emoji: '📱' },
            { name: 'Testimonial', duration: 4.8, emoji: '💬' },
            { name: 'CTA Ending', duration: 2.5, emoji: '🚀' }
        ];

        const clip = sampleClips[clipId];
        if (clip && this.totalDuration + clip.duration <= this.maxDuration) {
            this.clips.push({ ...clip, trimStart: 0, trimEnd: clip.duration });
            this.totalDuration += clip.duration;
            this.updateTimeline();
            this.updateDuration();
            this.updatePreview();
        }
    }

    updateTimeline() {
        const timeline = this.container.querySelector('#timeline .timeline-track');
        if (timeline) {
            timeline.innerHTML = this.renderTimeline();
        }
    }

    updateDuration() {
        const currentDuration = this.container.querySelector('.current-duration');
        const durationFill = this.container.querySelector('.duration-fill');

        if (currentDuration) {
            currentDuration.textContent = `${this.totalDuration.toFixed(1)}s`;
        }

        if (durationFill) {
            const percentage = Math.min((this.totalDuration / this.maxDuration) * 100, 100);
            durationFill.style.width = `${percentage}%`;
        }
    }

    updatePreview() {
        const previewContent = this.container.querySelector('.preview-content');
        if (previewContent && this.clips.length > 0) {
            previewContent.innerHTML = `
                <div class="preview-placeholder">
                    🎬 ${this.clips.length} Clips | ${this.totalDuration.toFixed(1)}s
                    <div class="aspect-label">${this.currentAspectRatio}</div>
                    <div class="clip-list" style="font-size: 12px; margin-top: 10px; opacity: 0.7;">
                        ${this.clips.map(clip => clip.emoji + ' ' + clip.name).join(' → ')}
                    </div>
                </div>
            `;
        }
    }

    startTrim(event, clipIndex, handle) {
        event.preventDefault();
        event.stopPropagation();

        const startX = event.clientX;
        const clip = this.clips[clipIndex];
        const originalDuration = clip.trimEnd - clip.trimStart;

        const handleMouseMove = (e) => {
            const deltaX = e.clientX - startX;
            const deltaTime = (deltaX / 200) * clip.duration; // 200px = full duration

            if (handle === 'left') {
                clip.trimStart = Math.max(0, Math.min(clip.trimStart + deltaTime, clip.trimEnd - 0.1));
            } else {
                clip.trimEnd = Math.max(clip.trimStart + 0.1, Math.min(clip.trimEnd + deltaTime, clip.duration));
            }

            this.recalculateDuration();
            this.updateDuration();
            this.updatePreview();
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }

    recalculateDuration() {
        this.totalDuration = this.clips.reduce((total, clip) => {
            return total + (clip.trimEnd - clip.trimStart);
        }, 0);
    }

    handleFileUpload(files) {
        Array.from(files).forEach((file, index) => {
            if (file.type.startsWith('video/')) {
                // Simulate clip processing
                setTimeout(() => {
                    const newClip = {
                        name: file.name.replace(/\.[^/.]+$/, ''),
                        duration: 5.0 + Math.random() * 10, // Random duration
                        emoji: '📹'
                    };

                    this.addUploadedClip(newClip);
                }, index * 500);
            }
        });
    }

    addUploadedClip(clip) {
        const libraryGrid = this.container.querySelector('.library-grid');
        if (libraryGrid) {
            const clipElement = document.createElement('div');
            clipElement.className = 'library-clip';
            clipElement.draggable = true;
            clipElement.dataset.clipId = 'custom';
            clipElement.innerHTML = `
                <div class="clip-thumbnail">${clip.emoji}</div>
                <div class="clip-name">${clip.name}</div>
                <div class="clip-duration">${clip.duration.toFixed(1)}s</div>
            `;
            libraryGrid.appendChild(clipElement);
        }
    }

    exportReel() {
        const exportData = {
            clips: this.clips,
            aspectRatio: this.currentAspectRatio,
            totalDuration: this.totalDuration,
            exportFormat: 'mp4',
            quality: 'high',
            timestamp: new Date().toISOString()
        };

        // Simulate export process
        const exportBtn = this.container.querySelector('.export-btn');
        const originalText = exportBtn.textContent;

        exportBtn.textContent = '⏳ Exportiere...';
        exportBtn.disabled = true;

        setTimeout(() => {
            exportBtn.textContent = '✅ Export Fertig!';

            setTimeout(() => {
                exportBtn.textContent = originalText;
                exportBtn.disabled = false;
            }, 2000);
        }, 3000);

        console.log('Reel Export:', exportData);

        // Hier würde normalerweise der echte Export-Prozess starten
        // this.processVideoExport(exportData);
    }
}

// Global functions for event handlers
window.allowDrop = (ev) => {
    ev.preventDefault();
};

window.drop = (ev) => {
    ev.preventDefault();
    // Handled by component event listeners
};

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('reelComposer');
    if (container) {
        window.reelComposer = new ReelComposer(container);
    }
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ReelComposer;
}