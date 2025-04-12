// 检查浏览器支持
document.addEventListener('DOMContentLoaded', () => {
    if (typeof SharedArrayBuffer === 'undefined') {
        document.getElementById('browserWarning').style.display = 'flex';
        document.getElementById('extractBtn').disabled = true;
        updateStatus('您的浏览器不支持必要功能', 'warning');
    }
});

// 获取DOM元素
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const extractBtn = document.getElementById('extractBtn');
const statusDiv = document.getElementById('status');
const downloadLink = document.getElementById('downloadLink');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const ffmpegLoading = document.getElementById('ffmpegLoading');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');

// 初始化FFmpeg
const { createFFmpeg, fetchFile } = FFmpeg;
const ffmpeg = createFFmpeg({ 
    log: true,
    corePath: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
    wasmPath: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/ffmpeg-core.wasm'
});

// 状态管理
let selectedFile = null;
let isProcessing = false;

// 更新状态显示
function updateStatus(message, type = 'info') {
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

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
}

// 点击上传区域触发文件选择
uploadArea.addEventListener('click', (e) => {
    if (e.target.tagName !== 'INPUT') {
        fileInput.click();
    }
});

// 拖放功能
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#4361ee';
    uploadArea.style.backgroundColor = 'rgba(67, 97, 238, 0.05)';
});

uploadArea.addEventListener('dragleave', () => {
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
    extractBtn.disabled = false;
    
    // 更新文件信息显示
    uploadArea.style.display = 'none';
    fileInfo.style.display = 'flex';
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    
    updateStatus('已选择文件，点击"提取音频"按钮开始', 'info');
    isProcessing = false;
}

// 提取按钮点击事件
extractBtn.addEventListener('click', startExtraction);

// 加载FFmpeg
async function loadFFmpeg() {
    return new Promise((resolve, reject) => {
        ffmpegLoading.style.display = 'block';
        updateStatus('正在初始化音频引擎，首次使用需要下载约25MB资源...', 'info');
        
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
    extractBtn.disabled = true;
    progressContainer.style.display = 'none';
    downloadLink.style.display = 'none';
    
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
        progressContainer.style.display = 'block';
        updateProgress(0);
        updateStatus('正在处理视频文件...', 'info');
        
        // 设置进度回调
        ffmpeg.setProgress(({ ratio }) => {
            const percent = Math.round(ratio * 100);
            updateProgress(percent);
            updateStatus(`正在处理: ${percent}%`, 'info');
        });
        
        // 写入文件到FFmpeg虚拟文件系统
        const fileName = selectedFile.name;
        ffmpeg.FS('writeFile', fileName, await fetchFile(selectedFile));
        
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
        
        downloadLink.href = url;
        downloadLink.download = fileName.replace(/\.[^/.]+$/, '') + '.mp3';
        downloadLink.style.display = 'flex';
        
        updateProgress(100);
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
function updateProgress(percent) {
    progressBar.style.width = `${percent}%`;
    progressText.textContent = `${percent}%`;
}