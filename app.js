/* ========================================
   🎨 ZKDownloader - Professional Download Manager
   Vidmate/Snaptube Style - Full Featured
   ======================================== */

// DOM Elements
const urlInput = document.getElementById('urlInput');
const fetchBtn = document.getElementById('fetchBtn');
const videoInfoCard = document.getElementById('videoInfo');
const videoThumbnail = document.getElementById('videoThumbnail');
const videoTitle = document.getElementById('videoTitle');
const videoDuration = document.getElementById('videoDuration');
const videoUploader = document.getElementById('videoUploader');
const formatsGrid = document.getElementById('formatsGrid');
const downloadSection = document.getElementById('downloadSection');
const downloadBtn = document.getElementById('downloadBtn');
const historyList = document.getElementById('historyList');
const toastContainer = document.getElementById('toastContainer');
// Format Tabs
const BACKEND_URL = (() => {
    // Railway production - same server
    if (window.location.hostname.includes('railway.app')) {
        return ''; // ✅ Empty string for same-origin requests
    }
    // Local development
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:5000';
    }
    return '';
})();


// State
let videoInfo = null;
let selectedFormat = null;
let currentFormatType = 'video';
let allFormats = [];
let activeDownloads = new Map(); // Track all active downloads
let progressPollingIntervals = new Map(); // Track polling intervals

// Initialize
loadHistory();
loadActiveDownloads();

// Event Listeners
fetchBtn.addEventListener('click', fetchFormats);
urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') fetchFormats();
});

downloadBtn.addEventListener('click', startDownload);

formatTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        formatTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentFormatType = tab.dataset.type;
        displayFormats(allFormats);
    });
});

// URL Validation
function isValidURL(string) {
    if (!string || !string.trim()) return false;
    
    try {
        // Add protocol if missing
        let urlString = string.trim();
        if (!urlString.match(/^https?:\/\//i)) {
            urlString = 'https://' + urlString;
        }
        
        const url = new URL(urlString);
        const hostname = url.hostname.toLowerCase();
        
        // Remove www. prefix for matching
        const hostnameWithoutWww = hostname.replace(/^www\./, '');
        
        const validDomains = [
            'youtube.com', 
            'youtu.be', 
            'm.youtube.com',
            'instagram.com', 
            'www.instagram.com',
            'tiktok.com', 
            'www.tiktok.com',
            'twitter.com',
            'x.com',
            'facebook.com', 
            'www.facebook.com',
            'fb.watch',
            'm.facebook.com'
        ];
        
        // Check if hostname matches any valid domain
        return validDomains.some(domain => {
            const domainLower = domain.toLowerCase();
            return hostname === domainLower || 
                   hostnameWithoutWww === domainLower ||
                   hostname.endsWith('.' + domainLower);
        });
    } catch {
        return false;
    }
}

// Normalize URL (add protocol if missing)
function normalizeURL(urlString) {
    if (!urlString) return urlString;
    
    let normalized = urlString.trim();
    
    // Add protocol if missing
    if (!normalized.match(/^https?:\/\//i)) {
        normalized = 'https://' + normalized;
    }
    
    return normalized;
}

// Fetch Video Formats
async function fetchFormats() {
    const url = urlInput.value.trim();
    
    if (!url) {
        showToast('Please enter a video URL', 'error');
        return;
    }
    
    if (!isValidURL(url)) {
        showToast('Please enter a valid video URL from supported platforms', 'error');
        return;
    }

    fetchBtn.disabled = true;
    fetchBtn.innerHTML = '<span class="loading"></span> <span>Fetching...</span>';
    
    try {
        const normalizedUrl = normalizeURL(url);
        
        const response = await fetch(`${BACKEND_URL}/api/info?url=${encodeURIComponent(normalizedUrl)}`);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to fetch video info. Make sure backend is running!');
        }

        const data = await response.json();
        
        videoInfo = data;
        allFormats = data.formats || [];
        displayVideoInfo(data);
        displayFormats(allFormats);
        
        showToast('✨ Formats loaded successfully!', 'success');
    } catch (error) {
        console.error('Error:', error);
        showToast(error.message || 'Error fetching formats. Please try again.', 'error');
        videoInfoCard.classList.remove('active');
    } finally {
        fetchBtn.disabled = false;
        fetchBtn.innerHTML = '<span>🔍</span> <span>Fetch Formats</span>';
    }
}

// Display Video Info
function displayVideoInfo(info) {
    if (info.thumbnail) {
        videoThumbnail.src = info.thumbnail;
    }
    
    videoTitle.textContent = info.title || 'Video Title';
    videoDuration.textContent = formatDuration(info.duration || 0);
    videoUploader.textContent = info.uploader || 'Unknown';
    
    videoInfoCard.classList.add('active');
    videoInfoCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Format Duration Helper
function formatDuration(seconds) {
    if (!seconds) return '0:00';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Format File Size Helper
function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return 'Size varies';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

// Estimate file size
function estimateFileSize(format, duration) {
    if (format.filesize && format.filesize > 0) {
        return format.filesize;
    }
    
    if (format.filesize_approx && format.filesize_approx > 0) {
        return format.filesize_approx;
    }
    
    if (format.tbr && duration) {
        const estimatedBytes = (format.tbr * 1000 * duration) / 8;
        return estimatedBytes;
    }
    
    if (format.height) {
        const bitrateEstimates = {
            2160: 8000, 1440: 5000, 1080: 3000,
            720: 1500, 480: 800, 360: 500,
        };
        
        const closestRes = Object.keys(bitrateEstimates)
            .map(Number)
            .sort((a, b) => Math.abs(format.height - a) - Math.abs(format.height - b))[0];
        
        if (duration) {
            const estimatedBitrate = bitrateEstimates[closestRes];
            return (estimatedBitrate * 1000 * duration) / 8;
        }
    }
    
    return 0;
}

// Display Formats
function displayFormats(formats) {
    formatsGrid.innerHTML = '';
    
    let filteredFormats = [];
    
    if (currentFormatType === 'audio') {
        filteredFormats = formats.filter(f => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'));
        
        if (filteredFormats.length === 0) {
            filteredFormats = formats.filter(f => f.acodec && f.acodec !== 'none').slice(0, 5);
        }
        
        filteredFormats.sort((a, b) => (b.abr || 0) - (a.abr || 0));
    } else {
        filteredFormats = formats.filter(f => f.vcodec && f.vcodec !== 'none' && f.height);
        filteredFormats.sort((a, b) => (b.height || 0) - (a.height || 0));
        
        const seen = new Set();
        filteredFormats = filteredFormats.filter(f => {
            const key = f.height;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }
    
    filteredFormats = filteredFormats.slice(0, 6);
    
    if (filteredFormats.length === 0) {
        formatsGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">No formats available</p>';
        return;
    }
    
    filteredFormats.forEach((format, index) => {
        const card = createFormatCard(format, index === 0);
        formatsGrid.appendChild(card);
    });
}

// Create Format Card
function createFormatCard(format, isRecommended) {
    const card = document.createElement('div');
    card.className = 'format-card';
    
    let quality, badge;
    
    if (currentFormatType === 'audio') {
        quality = format.abr ? `${Math.round(format.abr)}kbps` : 'Audio';
        badge = isRecommended ? 'BEST' : 'AUDIO';
    } else {
        quality = format.height ? `${format.height}p` : 'Video';
        badge = isRecommended ? 'BEST' : quality.replace('p', 'P');
    }
    
    const estimatedSize = estimateFileSize(format, videoInfo?.duration || 0);
    const fileSize = formatFileSize(estimatedSize);
    const codec = format.vcodec && format.vcodec !== 'none' ? format.vcodec.split('.')[0].toUpperCase() : 
                  format.acodec && format.acodec !== 'none' ? format.acodec.split('.')[0].toUpperCase() : 'N/A';
    const fps = format.fps ? `${format.fps}fps` : '';
    
    card.innerHTML = `
        <div class="format-header">
            <div class="format-quality">${quality}</div>
            <div class="quality-badge">${badge}</div>
        </div>
        <div class="format-details">
            <div class="detail-row">
                <span>📦 Size:</span>
                <span>${fileSize}</span>
            </div>
            <div class="detail-row">
                <span>🎞️ Codec:</span>
                <span>${codec}</span>
            </div>
            ${fps ? `<div class="detail-row"><span>⚡ FPS:</span><span>${fps}</span></div>` : ''}
        </div>
        <div class="check-icon" style="display: none;">✓</div>
    `;
    
    card.addEventListener('click', () => {
        document.querySelectorAll('.format-card').forEach(c => {
            c.classList.remove('selected');
            c.querySelector('.check-icon').style.display = 'none';
        });
        card.classList.add('selected');
        card.querySelector('.check-icon').style.display = 'flex';
        
        selectedFormat = {
            formatId: format.format_id,
            quality: quality,
            ...format
        };
        
        downloadBtn.disabled = false;
        downloadSection.classList.add('active');
        downloadSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    
    return card;
}

// Start Download with Download Manager
async function startDownload() {
    if (!selectedFormat) {
        showToast('Please select a format first', 'error');
        return;
    }

    downloadBtn.disabled = true;
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/start-download`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: normalizeURL(urlInput.value.trim()),
                format: selectedFormat.formatId,
                title: videoInfo?.title || 'video'
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to start download');
        }
        
        const data = await response.json();
        const downloadId = data.download_id;
        
        // Add to active downloads
        const formatQuality = selectedFormat.quality || 'Unknown';
        const formatSize = estimateFileSize(selectedFormat, videoInfo?.duration || 0);
        const formatCodec = selectedFormat.vcodec && selectedFormat.vcodec !== 'none' ? 
                           selectedFormat.vcodec.split('.')[0].toUpperCase() : 
                           (selectedFormat.acodec && selectedFormat.acodec !== 'none' ? 
                           selectedFormat.acodec.split('.')[0].toUpperCase() : 'N/A');
        const formatExt = selectedFormat.ext || 'mp4';
        
        activeDownloads.set(downloadId, {
            id: downloadId,
            title: videoInfo?.title || 'video',
            thumbnail: videoInfo?.thumbnail || '',
            format: formatQuality,
            formatCodec: formatCodec,
            formatExt: formatExt,
            formatSize: formatSize,
            status: 'preparing',
            progress: 0,
            downloaded: 0,
            total: 0,
            speed: 0,
            eta: 0
        });
        
        // Add to download queue UI
        addDownloadToQueue(downloadId);
        
        // Start polling for progress
        startProgressPolling(downloadId);
        
        showToast('🚀 Download started!', 'success');
        downloadBtn.disabled = false;
        
        // Add to history
        addToHistory(videoInfo?.title || 'Downloaded Video');
        
    } catch (error) {
        console.error('Download error:', error);
        showToast('Failed to start download. Please try again.', 'error');
        downloadBtn.disabled = false;
    }
}

// Add download to queue UI
function addDownloadToQueue(downloadId) {
    const download = activeDownloads.get(downloadId);
    if (!download) return;
    
    // Create download item in history section
    const downloadItem = document.createElement('div');
    downloadItem.className = 'download-item active-download';
    downloadItem.id = `download-${downloadId}`;
    
    const formatInfo = download.format || 'Unknown';
    const formatCodec = download.formatCodec || 'N/A';
    const formatExt = download.formatExt || 'mp4';
    const formatSize = download.formatSize ? formatFileSize(download.formatSize) : '--';
    
    downloadItem.innerHTML = `
        <div class="download-thumbnail">
            <img src="${download.thumbnail || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'%3E%3Crect fill=\'%23444\' width=\'100\' height=\'100\'/%3E%3C/svg%3E'}" alt="Thumbnail">
        </div>
        <div class="download-info-section">
            <div class="download-header">
                <div class="download-title">${download.title}</div>
                <div class="download-format-badge">${formatInfo}</div>
            </div>
            <div class="download-details">
                <span class="detail-tag">${formatExt.toUpperCase()}</span>
                <span class="detail-tag">${formatCodec}</span>
                <span class="detail-tag">${formatSize}</span>
            </div>
            <div class="download-progress-wrapper">
                <div class="download-progress-bar">
                    <div class="download-progress-fill" style="width: 0%"></div>
                </div>
                <span class="progress-percentage">0%</span>
            </div>
            <div class="download-stats">
                <span class="download-status">⏳ Preparing...</span>
                <span class="download-speed">--</span>
            </div>
        </div>
        <div class="download-actions">
            <button class="action-btn pause-btn" onclick="pauseDownload('${downloadId}')" title="Pause">
                ⏸️
            </button>
            <button class="action-btn resume-btn" onclick="resumeDownload('${downloadId}')" title="Resume" style="display:none;">
                ▶️
            </button>
            <button class="action-btn cancel-btn" onclick="cancelDownload('${downloadId}')" title="Cancel">
                ❌
            </button>
        </div>
    `;
    
    // Insert at top of history
    const firstChild = historyList.firstElementChild;
    if (firstChild && firstChild.classList && firstChild.classList.contains('empty-state')) {
        historyList.innerHTML = '';
    }
    if (historyList.firstChild) {
        historyList.insertBefore(downloadItem, historyList.firstChild);
    } else {
        historyList.appendChild(downloadItem);
    }
}

// Start polling for download progress
function startProgressPolling(downloadId) {
    const pollInterval = setInterval(async () => {
        try {
            const response = await fetch(`${BACKEND_URL}/api/download-progress/${downloadId}`);
            
            if (!response.ok) {
                clearInterval(pollInterval);
                progressPollingIntervals.delete(downloadId);
                return;
            }
            
            const data = await response.json();
            updateDownloadUI(downloadId, data);
            
            // Stop polling if completed/cancelled/error
            if (['completed', 'cancelled', 'error'].includes(data.status)) {
                clearInterval(pollInterval);
                progressPollingIntervals.delete(downloadId);
                
                if (data.status === 'completed') {
                    // Auto-download the file
                    downloadCompletedFile(downloadId);
                }
            }
            
        } catch (error) {
            console.error('Progress polling error:', error);
        }
    }, 500); // Poll every 500ms
    
    progressPollingIntervals.set(downloadId, pollInterval);
}

// Update download UI with progress
function updateDownloadUI(downloadId, data) {
    const downloadItem = document.getElementById(`download-${downloadId}`);
    if (!downloadItem) return;
    
    const progressFill = downloadItem.querySelector('.download-progress-fill');
    const progressPercentage = downloadItem.querySelector('.progress-percentage');
    const statusText = downloadItem.querySelector('.download-status');
    const speedText = downloadItem.querySelector('.download-speed');
    
    // Update progress bar
    const progress = data.progress || 0;
    progressFill.style.width = `${progress}%`;
    if (progressPercentage) {
        progressPercentage.textContent = `${progress.toFixed(0)}%`;
    }
    
    // Update status
    const statusEmojis = {
        'preparing': '⏳',
        'downloading': '⬇️',
        'processing': '⚙️',
        'completed': '✅',
        'paused': '⏸️',
        'error': '❌',
        'cancelled': '🚫'
    };
    
    const emoji = statusEmojis[data.status] || '📥';
    let statusMsg = data.status.charAt(0).toUpperCase() + data.status.slice(1);
    
    statusText.textContent = `${emoji} ${statusMsg}`;
    
    // Update speed
    if (data.speed && data.speed > 0 && data.status === 'downloading') {
        const speed = formatSpeed(data.speed);
        const eta = data.eta ? ` • ${formatTime(data.eta)}` : '';
        speedText.textContent = `${speed}${eta}`;
    } else {
        speedText.textContent = '';
    }
    
    // Update buttons visibility
    const pauseBtn = downloadItem.querySelector('.pause-btn');
    const resumeBtn = downloadItem.querySelector('.resume-btn');
    
    if (data.status === 'paused') {
        pauseBtn.style.display = 'none';
        resumeBtn.style.display = 'inline-block';
    } else if (data.status === 'downloading' || data.status === 'preparing') {
        pauseBtn.style.display = 'inline-block';
        resumeBtn.style.display = 'none';
    } else {
        pauseBtn.style.display = 'none';
        resumeBtn.style.display = 'none';
    }
    
    // Update in activeDownloads map
    activeDownloads.set(downloadId, { ...activeDownloads.get(downloadId), ...data });
}

// Format speed
function formatSpeed(bytesPerSecond) {
    if (!bytesPerSecond) return '--';
    
    if (bytesPerSecond > 1024 * 1024) {
        return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`;
    } else if (bytesPerSecond > 1024) {
        return `${(bytesPerSecond / 1024).toFixed(2)} KB/s`;
    } else {
        return `${bytesPerSecond.toFixed(0)} B/s`;
    }
}

// Format time (ETA)
function formatTime(seconds) {
    if (!seconds || seconds < 0) return '--';
    
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${hours}h ${mins}m`;
    } else if (mins > 0) {
        return `${mins}m ${secs}s`;
    } else {
        return `${secs}s`;
    }
}

// Pause download
async function pauseDownload(downloadId) {
    try {
        const response = await fetch(`${BACKEND_URL}/api/pause-download/${downloadId}`, {
            method: 'POST'
        });
        
        if (response.ok) {
            showToast('⏸️ Download paused', 'info');
        }
    } catch (error) {
        console.error('Pause error:', error);
        showToast('Failed to pause download', 'error');
    }
}

// Resume download
async function resumeDownload(downloadId) {
    try {
        const response = await fetch(`${BACKEND_URL}/api/resume-download/${downloadId}`, {
            method: 'POST'
        });
        
        if (response.ok) {
            showToast('▶️ Download resumed', 'success');
            
            // Restart polling
            if (!progressPollingIntervals.has(downloadId)) {
                startProgressPolling(downloadId);
            }
        }
    } catch (error) {
        console.error('Resume error:', error);
        showToast('Failed to resume download', 'error');
    }
}

// Cancel download
async function cancelDownload(downloadId) {
    try {
        const response = await fetch(`${BACKEND_URL}/api/cancel-download/${downloadId}`, {
            method: 'POST'
        });
        
        if (response.ok) {
            showToast('🚫 Download cancelled', 'info');
            
            // Remove from UI
            const downloadItem = document.getElementById(`download-${downloadId}`);
            if (downloadItem) {
                downloadItem.remove();
            }
            
            // Clear polling
            const interval = progressPollingIntervals.get(downloadId);
            if (interval) {
                clearInterval(interval);
                progressPollingIntervals.delete(downloadId);
            }
            
            // Remove from active downloads
            activeDownloads.delete(downloadId);
        }
    } catch (error) {
        console.error('Cancel error:', error);
        showToast('Failed to cancel download', 'error');
    }
}

// Download completed file - Proper file save
async function downloadCompletedFile(downloadId) {
    try {
        const download = activeDownloads.get(downloadId);
        
        // Fetch the file as blob
        const response = await fetch(`${BACKEND_URL}/api/get-file/${downloadId}`);
        
        if (!response.ok) {
            throw new Error('Failed to download file');
        }
        
        // Get filename from Content-Disposition header or use default
        const contentDisposition = response.headers.get('content-disposition');
        let filename = download?.title || 'video';
        
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
            if (filenameMatch && filenameMatch[1]) {
                filename = filenameMatch[1].replace(/['"]/g, '');
            }
        }
        
        // Add extension if not present
        if (!filename.includes('.')) {
            filename += '.mp4';
        }
        
        // Get blob and create download link
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        
        // Cleanup
        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(downloadUrl);
        }, 100);
        
        showToast('✅ Download saved successfully!', 'success');
        
        // Update UI after a delay
        setTimeout(() => {
            const downloadItem = document.getElementById(`download-${downloadId}`);
            if (downloadItem) {
                downloadItem.classList.add('completed');
            }
        }, 2000);
        
    } catch (error) {
        console.error('File download error:', error);
        showToast('Failed to save file. Please try again.', 'error');
    }
}

// Load active downloads on page load
async function loadActiveDownloads() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/active-downloads`);
        
        if (response.ok) {
            const data = await response.json();
            data.downloads.forEach(download => {
                activeDownloads.set(download.id, download);
                addDownloadToQueue(download.id);
                startProgressPolling(download.id);
            });
        }
    } catch (error) {
        console.error('Load active downloads error:', error);
    }
}

// History Management
function addToHistory(title) {
    const history = getHistory();
    const item = {
        title: title,
        date: new Date().toLocaleString(),
        timestamp: Date.now()
    };
    
    history.unshift(item);
    
    if (history.length > 10) {
        history.pop();
    }
    
    localStorage.setItem('downloadHistory', JSON.stringify(history));
}

function getHistory() {
    try {
        return JSON.parse(localStorage.getItem('downloadHistory')) || [];
    } catch {
        return [];
    }
}

function loadHistory() {
    // History is now managed by download queue
    // Keep this function for compatibility
}

// Toast Notifications
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => {
            toastContainer.removeChild(toast);
        }, 300);
    }, 4000);
}

// Make functions globally available
window.pauseDownload = pauseDownload;
window.resumeDownload = resumeDownload;
window.cancelDownload = cancelDownload;

// PWA Support
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {
            console.log('Service Worker registration failed');
        });
    });
}
