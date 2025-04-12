// 检查浏览器支持
if (typeof SharedArrayBuffer === 'undefined') {
    document.getElementById('browserWarning').style.display = 'block';
    document.getElementById('extractBtn').disabled = true;
    document.getElementById('status').textContent = '浏览器不支持必要功能';
}

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

// 初始化FFmpeg
const { createFFmpeg, fetchFile } = FFmpeg;
const ffmpeg = createFFmpeg({ 
    log: true,
    corePath: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
    wasmPath: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/ffmpeg-core.wasm'
});

// 存储选中的文件
let selectedFile = null;
let isProcessing = false;

// 增强版的FFmpeg加载函数
async function loadFFmpegWithProgress() {
    return new Promise((resolve, reject) => {
        ffmpegLoading.style.display = 'block';
        statusDiv.textContent = '正在初始化音频引擎...';
        
        const timeout = setTimeout(() => {
            reject(new Error('加载超时，请检查网络连接后刷新页面'));
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

// 点击上传区域触发文件选择
uploadArea.addEventListener('click', (e) => {
    if (e.target.tagName !== 'INPUT') {
        fileInput.click();
    }
});

// 拖放功能
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#4285f4';
    uploadArea.style.backgroundColor = '#f0f7ff';
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.borderColor = '#ccc';
    uploadArea.style.backgroundColor = 'transparent';
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.style.borderColor = '#ccc';
    uploadArea.style.backgroundColor = 'transparent';
    
    if (e.dataTransfer.files.length && !isProcessing) {
        isProcessing = true;
        handleFileSelect(e.dataTransfer.files[0]);
    }
});

// 文件选择处理
fileInput.addEventListener('change', () => {
    if (fileInput.files.length && !isProcessing) {
        isProcessing = true;
        handleFileSelect(fileInput.files[0]);
    }
});

// 处理选中的文件
function handleFileSelect(file) {
    // 检查文件类型
    if (!file.type.startsWith('video/')) {
        statusDiv.textContent = '请选择有效的视频文件';
        isProcessing = false;
        return;
    }
    
    // 检查文件大小（限制50MB）
    if (file.size > 50 * 1024 * 1024) {
        statusDiv.textContent = '文件太大，请选择小于50MB的文件';
        isProcessing = false;
        return;
    }
    
    selectedFile = file;
    statusDiv.textContent = `已选择: ${file.name}`;
    extractBtn.disabled = false;
    
    // 更新上传区域显示
    uploadArea.innerHTML = `
        <span style="color: #4285f4; font-weight: bold;">
            ${file.name}<br>
            (${formatFileSize(file.size)})
        </span>
    `;
    
    isProcessing = false;
}

// 提取按钮点击事件
extractBtn.addEventListener('click', startExtraction);

// 开始提取处理
async function startExtraction() {
    if (!selectedFile || isProcessing) return;
    
    if (typeof SharedArrayBuffer === 'undefined') {
        statusDiv.innerHTML = '<span style="color:red;">错误：浏览器不支持SharedArrayBuffer</span>';
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
                await loadFFmpegWithProgress();
            } catch (loadError) {
                console.error('FFmpeg加载失败:', loadError);
                statusDiv.innerHTML = `
                    <span style="color:red;">
                        FFmpeg加载失败!<br>
                        可能原因:<br>
                        1. 网络连接问题<br>
                        2. 浏览器兼容性问题<br>
                        建议:<br>
                        - 刷新页面重试<br>
                        - 使用Chrome/Edge浏览器
                    </span>
                `;
                return;
            }
        }
        
        // 显示进度条
        progressContainer.style.display = 'block';
        updateProgress(0);
        
        // 设置进度回调
        ffmpeg.setProgress(({ ratio }) => {
            const percent = Math.round(ratio * 100);
            updateProgress(percent);
            statusDiv.textContent = `正在处理: ${percent}%`;
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
        downloadLink.style.display = 'block';
        
        statusDiv.textContent = '音频提取完成！';
        updateProgress(100);
        
    } catch (error) {
        console.error(error);
        statusDiv.textContent = `处理失败: ${error.message}`;
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

// 辅助函数：格式化文件大小
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
}