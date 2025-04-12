// 检查浏览器支持
document.addEventListener('DOMContentLoaded', () => {
    if (typeof SharedArrayBuffer === 'undefined') {
        document.getElementById('browserWarning').style.display = 'flex';
        document.getElementById('extractBtn').disabled = true;
        updateStatus('您的浏览器不支持必要功能', 'warning');
    }

    // 初始化FFmpeg
    initFFmpeg();
    
    // 设置上传事件
    setupUploadEvents();
});

// 全局变量
let selectedFile = null;
let isProcessing = false;
let ffmpeg;

// 初始化FFmpeg
function initFFmpeg() {
    const { createFFmpeg, fetchFile } = FFmpeg;
    ffmpeg = createFFmpeg({ 
        log: true,
        corePath: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
        wasmPath: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/ffmpeg-core.wasm'
    });
}

// 设置上传事件
function setupUploadEvents() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const changeFileBtn = document.getElementById('changeFile');
    const extractBtn = document.getElementById('extractBtn');
    
    // 点击上传区域
    uploadArea.addEventListener('click', (e) => {
        if (e.target !== fileInput) {
            fileInput.value = '';
            fileInput.click();
        }
    }, false);
    
    // 拖放上传
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.style.borderColor = '#4361ee';
        uploadArea.style.backgroundColor = 'rgba(67, 97, 238, 0.05)';
    });

    uploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.style.borderColor = '#dee2e6';
        uploadArea.style.backgroundColor = 'transparent';
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.style.borderColor = '#dee2e6';
        uploadArea.style.backgroundColor = 'transparent';
        
        if (e.dataTransfer.files.length && !isProcessing) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });

    // 文件选择处理
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length && !isProcessing) {
            handleFileSelect(fileInput.files[0]);
        }
    });

    // 更换文件按钮
    if (changeFileBtn) {
        changeFileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.value = '';
            fileInput.click();
        });
    }

    // 提取按钮事件
    extractBtn.addEventListener('click', startExtraction);
}

// 更新状态显示
function updateStatus(message, type = 'info') {
    const statusDiv = document.getElementById('status');
    const iconMap = {
        info: 'info-circle',
        warning: 'exclamation-triangle',
        error: 'times-circle',
        success: 'check-circle'
    };
    
    const colorMap = {
        info: '#4361ee',
        warning: '#f8961e',
        error: '#f94144',
        success: '#4cc9f0'
    };
    
    statusDiv.innerHTML = `
        <i class="fas fa-${iconMap[type]}" style="color: ${colorMap[type]}"></i>
        <span>${message}</span>
    `;
}

// 处理选中的文件
function handleFileSelect(file) {
    // 检查文件类型
    if (!file.type.startsWith('video/')) {
        updateStatus('请选择有效的视频文件 (MP4, MOV等)', 'warning');
        isProcessing = false;
        return;
    }
    
    // 检查文件大小（限制50MB）
    if (file.size > 50 * 1024 * 1024) {
        updateStatus('文件太大，请选择小于50MB的文件', 'warning');
        isProcessing = false;
        return;
    }
    
    selectedFile = file;
    document.getElementById('extractBtn').disabled = false;
    
    // 更新UI显示
    document.getElementById('uploadArea').style.display = 'none';
    const fileInfo = document.getElementById('fileInfo');
    fileInfo.style.display = 'flex';
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = formatFileSize(file.size);
    
    updateStatus('已选择文件，点击"提取音频"按钮开始', 'info');
    isProcessing = false;
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
}

// 加载FFmpeg
async function loadFFmpeg() {
    return new Promise((resolve, reject) => {
        const ffmpegLoading = document.getElementById('ffmpegLoading');
        ffmpegLoading.style.display = 'block';
        updateStatus('正在初始化音频引擎，首次使用需等待数秒...', 'info');
        
        const timeout = setTimeout(() => {
            reject(new Error('加载超时，请检查网络连接'));
        }, 30000);

        ffmpeg.load()
            .then(() => {
                clearTimeout(timeout);
                ffmpegLoading.style.display = 'none';
                resolve();
            })
            .catch(err => {
                clearTimeout(timeout);
                ffmpegLoading.style.display = 'none';
                reject(err);
            });
    });
}

// 开始提取处理
async function startExtraction() {
    if (!selectedFile || isProcessing) return;
    
    if (typeof SharedArrayBuffer === 'undefined') {
        updateStatus('错误：浏览器不支持必要功能', 'error');
        return;
    }
    
    isProcessing = true;
    const extractBtn = document.getElementById('extractBtn');
    extractBtn.disabled = true;
    document.getElementById('progressContainer').style.display = 'none';
    document.getElementById('downloadLink').style.display = 'none';
    
    try {
        // 检查并加载FFmpeg
        if (!ffmpeg.isLoaded()) {
            try {
                await loadFFmpeg();
            } catch (loadError) {
                console.error('FFmpeg加载失败:', loadError);
                updateStatus(`FFmpeg加载失败: ${loadError.message}`, 'error');
                return;
            }
        }
        
        // 显示进度条
        const progressContainer = document.getElementById('progressContainer');
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');
        
        progressContainer.style.display = 'block';
        updateProgress(0, progressBar, progressText);
        updateStatus('正在处理视频文件...', 'info');
        
        // 设置进度回调
        ffmpeg.setProgress(({ ratio }) => {
            const percent = Math.round(ratio * 100);
            updateProgress(percent, progressBar, progressText);
            updateStatus(`正在处理: ${percent}%`, 'info');
        });
        
        // 写入文件到FFmpeg虚拟文件系统
        const fileName = selectedFile.name;
        ffmpeg.FS('writeFile', fileName, await FFmpeg.fetchFile(selectedFile));
        
        // 执行音频提取命令
        await ffmpeg.run(
            '-i', fileName,
            '-vn',
            '-acodec', 'libmp3lame',
            '-q:a', '2',
            'output.mp3'
        );
        
        // 读取结果
        const data = ffmpeg.FS('readFile', 'output.mp3');
        
        // 创建下载链接
        const blob = new Blob([data.buffer], { type: 'audio/mp3' });
        const url = URL.createObjectURL(blob);
        
        const downloadLink = document.getElementById('downloadLink');
        downloadLink.href = url;
        downloadLink.download = fileName.replace(/\.[^/.]+$/, '') + '.mp3';
        downloadLink.style.display = 'flex';
        
        updateProgress(100, progressBar, progressText);
        updateStatus('音频提取完成！点击下方按钮下载', 'success');
        
    } catch (error) {
        console.error('处理失败:', error);
        updateStatus(`处理失败: ${error.message}`, 'error');
    } finally {
        isProcessing = false;
        extractBtn.disabled = false;
    }
}

// 更新进度条
function updateProgress(percent, progressBar, progressText) {
    progressBar.style.width = `${percent}%`;
    progressText.textContent = `${percent}%`;
}