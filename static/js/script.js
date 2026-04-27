class SVSViewer {
    constructor() {
        this.canvas = document.getElementById('svsCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.drawCanvas = document.getElementById('drawCanvas');
        this.drawCtx = this.drawCanvas.getContext('2d');
        this.scale = 1.0;
        this.posX = 0;
        this.posY = 0;
        this.currentLevel = 0;
        this.levels = [];
        this.dimensions = [];
        this.filename = '';
        this.isDragging = false;
        this.lastX = 0;
        this.lastY = 0;
        this.isDrawing = false;
        this.currentPath = [];
        this.drawColor = '#ff0000';
        this.pathHistory = [];
        this.drawMode = 'free'; // free/rectangle/circle
        this.startX = 0;
        this.startY = 0;
        this.shiftPressed = false;
        this.altPressed = false;
        this.highlightedGroupId = null;
        this.highlightedPathIndex = null;

        this.initEventListeners();
        this.initDrawEventListeners();
        // ...原有属性初始化...
        this.brushSize = 2;

        // ...保持其他初始化代码不变...
        this.pathGroups = new Map(); // 使用Map存储颜色分组

        this.ctrlPressed = false; // 新增状态变量

        // 在constructor顶部属性声明区域添加
        this.overviewCanvas = document.getElementById('overviewCanvas');
        this.overviewCtx = this.overviewCanvas.getContext('2d');
        this.viewportIndicator = document.getElementById('viewportIndicator');
        this.showOverview = false;

        // 新增全局键盘事件监听
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Control' && !this.ctrlPressed) {
                this.ctrlPressed = true;
                e.preventDefault(); // 阻止默认菜单
            }
            if (e.key === 'Shift' && !this.shiftPressed) {
                this.shiftPressed = true;
                this.updateDrawMode();
                e.preventDefault();
            }
            if (e.key === 'Alt' && !this.altPressed) {
                this.altPressed = true;
                this.updateDrawMode();
                e.preventDefault();
            }
        });
    
        document.addEventListener('keyup', (e) => {
            if (e.key === 'Control') {
                this.ctrlPressed = false;
                if (this.isDrawing) this.finishDrawing();
            }
            if (e.key === 'Shift') {
                this.shiftPressed = false;
                this.updateDrawMode();
            }
            if (e.key === 'Alt') {
                this.altPressed = false;
                this.updateDrawMode();
            }
        });

        // script.js 修改初始化代码
        document.addEventListener('DOMContentLoaded', () => {
            window.viewer = new SVSViewer(); // 声明为全局变量
        });
        
        // 新增初始化
        document.getElementById('brushSize').addEventListener('input', (e) => {
            this.brushSize = parseInt(e.target.value);
        });
        this.groups = [];
        this.activeGroupId = null;
        
        // 新增事件监听
        document.getElementById('createGroup').addEventListener('click', () => this.createNewGroup());

        // 修改颜色选择器事件监听
        document.getElementById('drawColor').addEventListener('input', (e) => {
            this.drawColor = e.target.value;
            this.updateCreateButtonState();  // 新增
        // 移除自动创建新组逻辑，改为手动选择或创建
        });
        document.getElementById('exportCompleteBtn').addEventListener('click', () => {
            document.getElementById('exportOverlay').style.display = 'none';
            this.lockInterface(false);
        });
        // 在script.js的constructor中找到事件绑定部分，添加：
        document.getElementById('exportXML').addEventListener('click', () => this.exportAllToXML());
    }

    exportAllToXML() {
        if (!this.filename || this.groups.length === 0) {
            alert("请先上传文件并创建标注");
            return;
        }
        // 获取用户输入的文件名
        const defaultName = `${this.filename.replace('.svs', '')}_annotations.xml`;
        const fileName = prompt('请输入XML文件名', defaultName);
        if (!fileName) return;
    
        // 生成XML结构
        let xmlContent = `<?xml version="1.0"?>
    <ASAP_Annotations>
        <Annotations>`;
    
        // 遍历所有可见的分组和路径
        let annotationIndex = 0;
        const level0Width = this.dimensions[0][0];
        const currentLevelWidth = this.dimensions[this.currentLevel][0];
        const scaleRatio = level0Width / currentLevelWidth;
    
        this.groups.forEach(group => {
            if (!group.visible) return;
    
            group.paths.forEach(path => {
                if (!path.visible) return;
    
                xmlContent += `
            <Annotation Name="${path.name}" Type="Polygon" PartOfGroup="${group.title}" Color="${group.color}">
                <Coordinates>`;
    
                path.points.forEach((point, index) => {
                    // 转换为level 0坐标
                    const x = Math.round(point.x * scaleRatio);
                    const y = Math.round(point.y * scaleRatio);
                    xmlContent += `
                    <Coordinate Order="${index}" X="${x}" Y="${y}" />`;
                });
    
                xmlContent += `
                </Coordinates>
            </Annotation>`;
                annotationIndex++;
            });
        });
    
        xmlContent += `
        </Annotations>
        <AnnotationGroups />
    </ASAP_Annotations>`;
    
        // 创建Blob并下载
        const blob = new Blob([xmlContent], {type: 'text/xml'});
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;  // 使用用户输入的文件名
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }


    // 新增方法：更新绘图模式
    updateDrawMode() {

        const indicator = document.getElementById('modeIndicator');
    
        if (this.ctrlPressed && this.shiftPressed) {
            this.drawMode = 'rectangle';
            indicator.textContent = '矩形模式';
        } else if (this.ctrlPressed && this.altPressed) {
            this.drawMode = 'circle';
            indicator.textContent = '圆形模式';
        } else {
            this.drawMode = 'free';
            indicator.textContent = '自由绘制模式';
        }
        // if (this.ctrlPressed && this.shiftPressed) {
        //     this.drawMode = 'rectangle';
        // } else if (this.ctrlPressed && this.altPressed) {
        //     this.drawMode = 'circle';
        // } else {
        //     this.drawMode = 'free';
        // }
    }
    // 新增Ctrl键绘制方法
    startCtrlDrawing() {
        if (this.groups.length === 0) {
            if (!confirm('需要先创建分组，是否立即创建？')) return;
            this.createNewGroup();
        }
        this.isDrawing = true;
        this.currentPath = { points: [], color: this.drawColor, size: this.brushSize }; // 初始化路径
        this.drawCanvas.style.pointerEvents = 'auto';
        this.drawCanvas.style.cursor = 'crosshair';
        
        // 强制禁用底层画布交互
        this.canvas.style.pointerEvents = 'none';
        // 新增：重置绘图上下文
        this.drawCtx.beginPath(); // <-- 关键修复
        this.drawCanvas.style.pointerEvents = 'auto';
        this.drawCanvas.style.cursor = 'crosshair';
        this.canvas.style.pointerEvents = 'none';
    }
    finishCtrlDrawing() {
        this.isDrawing = false;
        this.canvas.style.pointerEvents = 'auto'; // 恢复底层交互
        this.finishDrawing();
        this.drawCanvas.style.pointerEvents = 'none';
        this.drawCanvas.style.cursor = 'default';
    }

    
    // 新增分组对象结构
    createNewGroup(color = this.drawColor) {


        // 弹出输入框获取标题
        const groupTitle = prompt('请输入分组标题', `分组-${this.groups.length + 1}`);
        if (!groupTitle) return; // 用户取消输入则不创建

        // 检查是否已存在相同颜色的组
        const existingGroup = this.groups.find(g => g.color === color);
        if (existingGroup) {
            this.activeGroupId = existingGroup.id;
            this.updateGroupList();
            return;
        }

        // 新建分组（添加title字段）
        const newGroup = {
            id: Date.now(),
            title: groupTitle, // 新增标题字段
            color: color,
            visible: true,
            paths: []
        };
        this.groups.push(newGroup);
        this.activeGroupId = newGroup.id;
        this.updateGroupList();
        this.redrawPaths();
        this.updateCreateButtonState(); // 新增：更新按钮状态
    }

    // 更新分组列表显示
    updateGroupList() {
        this.updateCreateButtonState(); // <-- 新增在此处
        const container = document.getElementById('groupList');
        container.innerHTML = '';
        this.groups.forEach(group => {
            const groupEl = document.createElement('div');
            groupEl.className = `group-item ${group.id === this.activeGroupId ? 'active-group' : ''}`;
            // 添加dataset属性存储分组ID
            groupEl.dataset.groupId = group.id; // <-- 新增这行
            // 添加轮廓列表
        const contoursHTML = `
        <div class="contour-list">
            ${group.paths.map(path => `
                <div class="contour-item">
                    <input type="checkbox" class="contour-visible" ${path.visible ? 'checked' : ''}>
                    <span class="contour-name">${path.name}</span>
                    <button class="delete-contour-btn">×</button>
                </div>
            `).join('')}
        </div>
    `;    
        groupEl.innerHTML = `
        <div>
            <div class="group-color" style="background:${group.color}"></div>
            <span class="group-title">${group.title}</span>
            <input type="checkbox" ${group.visible ? 'checked' : ''}>
            <div class="group-actions">
                <button class="select-group-btn">选择</button>
                <button class="export-group-btn">导出img</button>
                <button class="undo-group-btn" ${group.paths.length === 0 ? 'disabled' : ''}>撤回</button>
                <button class="delete-group-btn">删除</button>
            </div>
        </div>
        
        <div class="contour-list">${contoursHTML}</div>
    `;

        // 添加删除轮廓事件
        groupEl.querySelectorAll('.delete-contour-btn').forEach((btn, index) => {
            btn.addEventListener('click', () => {
                group.paths.splice(index, 1);
                this.redrawPaths();
                this.updateGroupList();
            });
        });
        groupEl.querySelectorAll('.contour-item').forEach((item, index) => {
            // 添加data-index属性存储路径索引
            item.dataset.groupId = group.id;
            item.dataset.pathIndex = index;
    
            // 添加鼠标悬停事件
            item.addEventListener('mouseenter', () => {
                this.highlightContour(group.id, index);
            });
            item.addEventListener('mouseleave', () => {
                this.clearHighlight();
            });
        });

        // 3. 添加轮廓可见性事件监听（约第373行，在contour-item循环内）
        groupEl.querySelectorAll('.contour-visible').forEach((checkbox, index) => {
            checkbox.addEventListener('change', (e) => {
            group.paths[index].visible = e.target.checked;
            this.redrawPaths();
            });
        });

        groupEl.querySelector('.select-group-btn').addEventListener('click', () => {
            // 新增：将分组移动到最顶部
            const groupIndex = this.groups.findIndex(g => g.id === group.id);
            if (groupIndex > 0) {
            const [movedGroup] = this.groups.splice(groupIndex, 1);
            this.groups.unshift(movedGroup);
            }

            this.activeGroupId = group.id;
            this.drawColor = group.color;
            document.getElementById('drawColor').value = group.color;
            this.updateGroupList();
            this.redrawPaths(); // 新增重绘逻辑
        });

        // 绑定撤回事件
        groupEl.querySelector('.undo-group-btn').addEventListener('click', () => {
            this.undoLastPath(group.id);
        });

        // 绑定删除事件
        groupEl.querySelector('.delete-group-btn').addEventListener('click', () => {
            this.deleteGroup(group.id);
        });

        // 绑定可见性切换
        groupEl.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
            group.visible = e.target.checked;
            this.redrawPaths();
        });
        // 在updateGroupList方法中找到导出按钮事件绑定处，添加：
        groupEl.querySelector('.export-group-btn').addEventListener('click', () => {
            this.exportGroup(group.id);
        });

        // ...其他事件绑定...
        container.appendChild(groupEl);
        });
    }



    updateLevelSelector() {
        const levelSelect = document.getElementById('levelSelect');
        levelSelect.innerHTML = '';
        
        for (let i = 0; i < this.levels; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `Level ${i} (${this.dimensions[i][0]}x${this.dimensions[i][1]})`;
            levelSelect.appendChild(option);
        }
        
        levelSelect.value = this.levels - 1; // 默认选择最低分辨率
    }

    initEventListeners() {
        // 上传按钮
        document.getElementById('uploadBtn').addEventListener('click', this.handleUpload.bind(this));
        
        // 缩放按钮
        document.getElementById('zoomIn').addEventListener('click', () => this.zoom(1.2));
        document.getElementById('zoomOut').addEventListener('click', () => this.zoom(0.8));
        document.getElementById('resetZoom').addEventListener('click', () => this.resetView());
        
        // 平移按钮
        // document.getElementById('panUp').addEventListener('click', () => this.pan(0, -100));
        // document.getElementById('panDown').addEventListener('click', () => this.pan(0, 100));
        // document.getElementById('panLeft').addEventListener('click', () => this.pan(-100, 0));
        // document.getElementById('panRight').addEventListener('click', () => this.pan(100, 0));
        document.getElementById('panUp').addEventListener('click', () => this.pan(0, -this.getPanStep('vertical')));
        document.getElementById('panDown').addEventListener('click', () => this.pan(0, this.getPanStep('vertical')));
        document.getElementById('panLeft').addEventListener('click', () => this.pan(-this.getPanStep('horizontal'), 0));
        document.getElementById('panRight').addEventListener('click', () => this.pan(this.getPanStep('horizontal'), 0));
        // 在initEventListeners方法末尾添加
        document.getElementById('birdViewBtn').addEventListener('click', () => {
            this.toggleOverview();
        });
        // 层级选择
        document.getElementById('levelSelect').addEventListener('change', (e) => {
            const oldLevel = this.currentLevel;
            const newLevel = parseInt(e.target.value);
            
            if (oldLevel === newLevel) return;

            // 新增：切换层级时强制关闭鸟瞰图
            if (this.showOverview) {
                this.showOverview = false;
                document.querySelector('.overview-container').style.display = 'none';
            }
        
            // 计算层级尺寸比例
            const ratio = this.dimensions[newLevel][0] / this.dimensions[oldLevel][0];
            
            // 保持视图位置比例
            this.posX *= ratio;
            this.posY *= ratio;
            
            this.currentLevel = newLevel;
            this.constrainPosition();
            this.loadImageRegion();
            // 新增：鸟瞰图按钮状态控制
            const birdBtn = document.getElementById('birdViewBtn');
            const enableBirdView = this.levels === 1 || newLevel === 0;  // 单层级或当前是level0时启用
            birdBtn.disabled = !enableBirdView;
            birdBtn.style.opacity = enableBirdView ? 1 : 0.5;
        });
        
        // 画布鼠标事件
        this.canvas.addEventListener('mousedown', this.startDrag.bind(this));
        this.canvas.addEventListener('mousemove', this.drag.bind(this));
        this.canvas.addEventListener('mouseup', this.endDrag.bind(this));
        this.canvas.addEventListener('mouseleave', this.endDrag.bind(this));
        this.canvas.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
    }

    initDrawEventListeners() {
         // 绘图按钮事件
        document.getElementById('toggleDraw').addEventListener('click', () => this.toggleDrawingMode());
        document.getElementById('clearDraw').addEventListener('click', () => this.clearDrawing());

        // 绘图画布事件（仅在此处绑定）
        this.drawCanvas.addEventListener('mousedown', this.startDrawing.bind(this));
        this.drawCanvas.addEventListener('mousemove', this.continueDrawing.bind(this));
        this.drawCanvas.addEventListener('mouseup', this.finishDrawing.bind(this));
        this.drawCanvas.addEventListener('mouseleave', this.finishDrawing.bind(this));
    }

    toggleDrawingMode() {
        this.isDrawing = !this.isDrawing;
        // 自动创建默认分组
        if (this.isDrawing && this.groups.length === 0) {
            this.createNewGroup();
        }
        this.drawCanvas.style.pointerEvents = this.isDrawing ? 'auto' : 'none';
        this.drawCanvas.style.cursor = this.isDrawing ? 'crosshair' : 'default';
        document.getElementById('toggleDraw').textContent = 
            this.isDrawing ? '退出绘制' : '绘制轮廓';
    }

   
    
    // 删除分组
    deleteGroup(groupId) {
        this.groups = this.groups.filter(g => g.id !== groupId);
        if (this.activeGroupId === groupId) this.activeGroupId = null;
        this.updateGroupList();
        this.redrawPaths();
        this.updateCreateButtonState(); // 新增：删除分组后也要更新
    }

    // 修改绘制完成方法
    finishDrawing() {
        if (!this.currentPath) return;

    // 生成最终路径数据前强制闭合
    switch(this.currentPath.type) {
        case 'rectangle':
            // 确保矩形有4个顶点
            if (this.currentPath.points.length === 0) {
                this.currentPath = null;
                return;
            }
            const endX = this.currentPath.startX + this.currentPath.points[0].x;
            const endY = this.currentPath.startY + this.currentPath.points[0].y;
            this.currentPath.points = [
                {x: this.currentPath.startX, y: this.currentPath.startY},
                {x: endX, y: this.currentPath.startY},
                {x: endX, y: endY},
                {x: this.currentPath.startX, y: endY},
                {x: this.currentPath.startX, y: this.currentPath.startY} // 闭合路径
            ];
            break;
            
        case 'circle':
            if (this.currentPath.points.length === 0) {
                this.currentPath = null;
                return;
            }
            const dx = this.currentPath.points[0].x;
            const dy = this.currentPath.points[0].y;
            const radius = Math.sqrt(dx*dx + dy*dy);
            this.currentPath.points = this.generateCirclePoints(
                this.currentPath.startX, 
                this.currentPath.startY, 
                radius
            );
            break;
    }


        // 只有主动闭合时才添加路径
    if (!this.currentPath || this.currentPath.points.length < 3) {
        this.currentPath = null;
        return;
    }

    // 弹出命名对话框
    const pathName = prompt('请输入轮廓标记名称', `轮廓-${new Date().getTime()}`);
    if (!pathName) {
        this.currentPath = null;
        return;
    }

    // 新增：显式闭合路径
    this.drawCtx.closePath(); // <-- 关键修复
    this.drawCtx.beginPath(); // <-- 开始新路径避免残留

    // 自动闭合路径
    const firstPoint = this.currentPath.points[0];
    this.currentPath.points.push({...firstPoint});

    const activeGroup = this.groups.find(g => g.id === this.activeGroupId);
    if (activeGroup) {
        activeGroup.paths.push({
            name: pathName, // 新增name字段
            points: this.currentPath.points,
            size: this.brushSize,
            visible: true // 新增默认可见状态
        });
    }

    this.currentPath = null;
    this.redrawPaths();
    this.updateGroupList();
    }

    // 修改重绘逻辑
    redrawPaths() {
        this.drawCtx.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);

    this.groups.forEach(group => {
        if (!group.visible) return;
        group.paths.forEach((path, pathIndex) => {
            if (!path.visible) return; // 新增可见性检查
            if (path.points.length < 3) return;

            // 判断是否是高亮路径（新增部分）
            const isHighlighted = (
                group.id === this.highlightedGroupId &&
                pathIndex === this.highlightedPathIndex
            );
            
            // 颜色处理（新增部分）
            let color = group.color;
            if (isHighlighted) {
                color = this.adjustColor(color, 30); // 颜色加深30%
            }

            this.drawCtx.beginPath();
            this.drawCtx.strokeStyle = color;  // 修改为使用color变量
            this.drawCtx.fillStyle = color + "4D";  // 修改为使用color变量
            this.drawCtx.lineWidth = path.size * this.scale;
            this.drawCtx.lineJoin = 'round';
            this.drawCtx.lineCap = 'round';

            // 转换坐标点（保持原有逻辑）
            path.points.forEach((point, index) => {
                const { canvasX, canvasY } = this.convertToCanvasCoords(point);
                if (index === 0) {
                    this.drawCtx.moveTo(canvasX, canvasY);
                } else {
                    this.drawCtx.lineTo(canvasX, canvasY);
                }
            });

            if (path.points.length >= 3) {
                this.drawCtx.closePath();
                this.drawCtx.fill();
                this.drawCtx.stroke();
            }
        });
        
    });

    // 更新按钮状态...
    document.querySelectorAll('.undo-group-btn').forEach(btn => {
        const groupId = parseInt(btn.closest('.group-item').dataset.groupId);
        const group = this.groups.find(g => g.id === groupId);
        btn.disabled = group ? group.paths.length === 0 : true;
    });
        
    }

   

    // 修改清除方法
    clearDrawing() {
        this.drawCtx.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);
        this.groups = [];
        this.activeGroupId = null;
        this.updateGroupList();
    }

    getImagePosition(e) {
        const rect = this.drawCanvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;
        return {
            x: (canvasX / this.scale) + this.posX, // 修正缩放偏移
            y: (canvasY / this.scale) + this.posY,
        canvasX,
        canvasY
        };
    }

    clearDrawing() {
        this.drawCtx.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);
        this.pathHistory = [];
    }
    
    async loadImageRegion() {
        if (!this.filename) return;
        
        const canvasWidth = this.canvas.parentElement.clientWidth;
        const canvasHeight = this.canvas.parentElement.clientHeight;
        
        // 计算需要加载的区域
        const viewWidth = canvasWidth / this.scale;
        const viewHeight = canvasHeight / this.scale;
        
        // 确保不超出图像边界
        const imgWidth = this.dimensions[this.currentLevel][0];
        const imgHeight = this.dimensions[this.currentLevel][1];
        
        let x = Math.max(0, Math.min(this.posX, imgWidth - viewWidth));
        let y = Math.max(0, Math.min(this.posY, imgHeight - viewHeight));
        
        const width = Math.min(viewWidth, imgWidth - x);
        const height = Math.min(viewHeight, imgHeight - y);
        
        try {
            const response = await fetch('/get_tile', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    filename: this.filename,
                    level: this.currentLevel,
                    x: Math.floor(x),
                    y: Math.floor(y),
                    width: Math.ceil(width),
                    height: Math.ceil(height)
                })
            });
            
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            // 创建图像对象
            const img = new Image();
            img.onload = () => {
                // 设置画布大小
                this.canvas.width = canvasWidth;
                this.canvas.height = canvasHeight;
                
                // 计算绘制参数
                const drawWidth = width * this.scale;
                const drawHeight = height * this.scale;
                const drawX = (x - this.posX) * this.scale;
                const drawY = (y - this.posY) * this.scale;
                
                // 绘制图像
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                this.ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

                // 同步绘图画布尺寸时重置路径
                this.drawCanvas.width = this.canvas.width;
                this.drawCanvas.height = this.canvas.height;
                this.redrawPaths(); // 强制重绘所有路径

                if (this.showOverview) this.updateViewportIndicator(); // <-- 正确位置

            };
            img.src = 'data:image/jpeg;base64,' + data.image;
            
        } catch (error) {
            console.error('Error loading image region:', error);
        }
    }
    // script.js 新增撤回方法
    undoLastPath(groupId) {
        const group = this.groups.find(g => g.id === groupId);
        if (!group || group.paths.length === 0) return;
        group.paths.pop();
        this.redrawPaths(); // 添加重绘触发
        this.updateGroupList(); // 更新按钮状态
}

    

    async handleUpload() {
        const fileInput = document.getElementById('svsFile');
    if (!fileInput.files.length) {
        alert('请先选择文件');
        return;
    }

    const file = fileInput.files[0];
    if (!file.name.toLowerCase().endsWith('.svs')) {
        alert('仅支持SVS格式文件');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
        const uploadBtn = document.getElementById('uploadBtn');
        uploadBtn.disabled = true;
        uploadBtn.textContent = '上传中...';

        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        // 检查响应状态
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`服务器错误 (${response.status}): ${error}`);
        }

        // 尝试解析JSON
        let data;
        try {
            data = await response.json();
        } catch (e) {
            throw new Error('无效的服务器响应');
        }

        if (data.error) {
            throw new Error(data.error);
        }
        
        // 处理成功响应
        this.filename = data.filename;
        this.levels = data.levels;
        this.dimensions = data.dimensions;

        // 更新UI后重置视图
        this.updateLevelSelector();
        this.currentLevel = this.levels - 1; // 使用最低分辨率层级
        this.resetView(); // 这会触发自适应居中

        // 在获取到层级信息后添加按钮状态判断
        this.levels = data.levels;
        const birdBtn = document.getElementById('birdViewBtn');
        // 新增判断：当层级数<=1时禁用按钮
        if (this.levels <= 1) {
            // 单层级时强制启用鸟瞰图
            birdBtn.disabled = false;
            birdBtn.style.opacity = 1;
        }
        
    } catch (error) {
        console.error('上传错误:', error);
        //alert('上传失败: ' + error.message);
    } finally {
        const uploadBtn = document.getElementById('uploadBtn');
        uploadBtn.disabled = false;
        uploadBtn.textContent = '上传SVS';
    }
    try {
        // ... 上传处理代码 ...
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        // 处理成功上传
        this.filename = data.filename;
        this.levels = data.levels;
        this.dimensions = data.dimensions;
        
        // 先更新选择器，再设置当前层级
        this.updateLevelSelector();
        this.currentLevel = this.levels - 1;
        this.resetView();
        
    } catch (error) {
        console.error('上传错误:', error);
        //alert('上传失败: ' + error.message);
    } finally {
        const uploadBtn = document.getElementById('uploadBtn');
        uploadBtn.disabled = false;
        uploadBtn.textContent = '上传SVS';
    }
    }

    

    zoom(factor) {
        // 保存当前中心点（画布中心对应的图像坐标）
        const container = this.canvas.parentElement;
        const centerX = container.clientWidth / 2;
        const centerY = container.clientHeight / 2;
        const imgCenterX = centerX / this.scale + this.posX;
        const imgCenterY = centerY / this.scale + this.posY;

        // 应用缩放
        this.scale *= factor;
        this.scale = Math.max(0.1, Math.min(this.scale, 10));

        // 计算新的位置保持中心点不变
        this.posX = imgCenterX - centerX / this.scale;
        this.posY = imgCenterY - centerY / this.scale;

        this.constrainPosition();
        this.loadImageRegion();

        // 在zoom方法末尾添加
        if(this.showOverview) this.updateViewportIndicator();
    }
    //新增
    getPanStep(direction) {
        const container = this.canvas.parentElement;
        return direction === 'horizontal' ? 
            container.clientWidth * 0.2 :  // 水平移动视口宽度的20%
            container.clientHeight * 0.2;  // 垂直移动视口高度的20%
    }

    pan(dx, dy) {
        // 转换为图像坐标系的位移
        const deltaX = dx / this.scale;
        const deltaY = dy / this.scale;
    
        this.posX += deltaX;
        this.posY += deltaY;
    
        this.constrainPosition();
        this.loadImageRegion();
        // 在pan方法末尾添加
        if(this.showOverview) this.updateViewportIndicator();
    }

    resetView() {
        if (!this.dimensions.length) return;

        const [imgWidth, imgHeight] = this.dimensions[this.currentLevel];
        const container = this.canvas.parentElement;
    
        // 计算最佳缩放比例（保留5%边距）
        const scaleX = container.clientWidth / imgWidth;
        const scaleY = container.clientHeight / imgHeight;
        this.scale = Math.min(scaleX, scaleY) * 0.95;

        // 计算初始位置使图像中心对齐
        this.posX = (imgWidth - container.clientWidth / this.scale) / 2;
        this.posY = (imgHeight - container.clientHeight / this.scale) / 2;

        this.loadImageRegion();
        // 新增：初始化时设置按钮状态
        const birdBtn = document.getElementById('birdViewBtn');
        if (this.levels <= 1) { // 当只有level0时
            birdBtn.disabled = true;
            birdBtn.style.opacity = 0.5;
        } else {
        // 保持原有逻辑
            birdBtn.disabled = this.levels > 1 && this.currentLevel !== 0;  // 仅多层级时检查当前level
            birdBtn.style.opacity = birdBtn.disabled ? 0.5 : 1;
        }
    }

    constrainPosition() {
        if (!this.dimensions.length) return;

        const [imgWidth, imgHeight] = this.dimensions[this.currentLevel];
        const viewWidth = this.canvas.parentElement.clientWidth / this.scale;
        const viewHeight = this.canvas.parentElement.clientHeight / this.scale;

        this.posX = Math.max(0, Math.min(imgWidth - viewWidth, this.posX));
        this.posY = Math.max(0, Math.min(imgHeight - viewHeight, this.posY));
    }

    startDrag(e) {
        this.isDragging = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.canvas.style.cursor = 'grabbing';
    }

    drag(e) {
        if (!this.isDragging) return;
        
        const dx = e.clientX - this.lastX;
        const dy = e.clientY - this.lastY;
        
        this.posX -= dx / this.scale;
        this.posY -= dy / this.scale;
        this.constrainPosition();
        
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        
        this.loadImageRegion();
    }

    endDrag() {
        this.isDragging = false;
        this.canvas.style.cursor = 'move';
    }

    handleWheel(e) {
        e.preventDefault();
        
        // 计算鼠标位置相对于图像的位置
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // 计算缩放前的图像位置
        const imgX = mouseX / this.scale + this.posX;
        const imgY = mouseY / this.scale + this.posY;
        
        // 确定缩放方向
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        
        // 应用缩放
        this.scale *= factor;
        this.scale = Math.max(0.1, Math.min(this.scale, 10));
        
        // 计算缩放后的位置
        this.posX = imgX - mouseX / this.scale;
        this.posY = imgY - mouseY / this.scale;
        
        this.constrainPosition();
        this.loadImageRegion();
    }

    // 修改绘制方法
    startDrawing(e) {
        if (this.groups.length === 0) {
            if (!confirm('需要先创建分组，是否立即创建？')) return;
            this.createNewGroup();
        }

        // 阻止默认行为
        e.preventDefault();
        
        const pos = this.getImagePosition(e);
        this.startX = pos.x;
        this.startY = pos.y;
        
        this.isDrawing = true;
        this.currentPath = {
            type: this.drawMode, // 新增形状类型
            points: [],
            color: this.drawColor,
            size: this.brushSize,
            startX: pos.x,    // 形状起始坐标
            startY: pos.y
        };

        // 初始化绘图上下文
        this.drawCtx.beginPath();
        this.drawCtx.strokeStyle = this.drawColor;
        this.drawCtx.fillStyle = this.drawColor + "4D";
        this.drawCtx.lineWidth = this.brushSize * this.scale;
        this.drawCtx.lineJoin = 'round';
        this.drawCtx.lineCap = 'round';
    
        this.drawCanvas.style.pointerEvents = 'auto';
        this.drawCanvas.style.cursor = 'crosshair';
        this.canvas.style.pointerEvents = 'none';
    }

    continueDrawing(e) {
        if (!this.isDrawing || !this.currentPath) return;

        // 阻止默认行为
        e.preventDefault();

        const pos = this.getImagePosition(e);
    
        // 清空临时画布
        this.drawCtx.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);
    
         // 根据模式绘制不同形状
        switch(this.currentPath.type) {
            case 'rectangle':
                this.drawRectangle(pos);
                // 记录终点坐标用于生成路径
                this.currentPath.points = [{
                    x: pos.x - this.currentPath.startX,
                    y: pos.y - this.currentPath.startY
                }];
                break;
            case 'circle':
                this.drawCircle(pos);
                // 记录半径参数
                this.currentPath.points = [{
                    x: pos.x - this.currentPath.startX,
                    y: pos.y - this.currentPath.startY
                }];
                break;
            default:
                this.currentPath.points.push({x: pos.x, y: pos.y});
                this.drawSegment(pos);
        }
    }



    beginPathDrawing(pos) {
        this.drawCtx.beginPath();
        this.drawCtx.moveTo(pos.canvasX, pos.canvasY);
        this.drawCtx.strokeStyle = this.currentPath.color;
        this.drawCtx.fillStyle = this.currentPath.color + "4D"; // 添加透明度
        this.drawCtx.lineWidth = this.currentPath.size;
        this.drawCtx.lineJoin = 'round';
        this.drawCtx.lineCap = 'round';
    }

    drawSegment(pos) {
        // 绘制线条
        this.drawCtx.lineTo(pos.canvasX, pos.canvasY);
        this.drawCtx.stroke();
    }

    // 新增分组管理方法
    clearDrawing() {
        this.drawCtx.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);
        this.pathGroups.clear();
    }


    // 修改坐标获取方法
    getImagePosition(e) {
        const rect = this.drawCanvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;
        return {
            x: canvasX / this.scale + this.posX,
            y: canvasY / this.scale + this.posY,
            canvasX,
            canvasY
        };
    }
    // 添加坐标转换方法
    convertToCanvasCoords(point) {
        return {
            canvasX: (point.x - this.posX) * this.scale,
            canvasY: (point.y - this.posY) * this.scale
        };
    }

    // 新增矩形绘制方法
    drawRectangle(endPos) {
        const startX = this.currentPath.startX;
        const startY = this.currentPath.startY;
    
        // 计算四个顶点
        const points = [
            {x: startX, y: startY},
            {x: endPos.x, y: startY},
            {x: endPos.x, y: endPos.y},
            {x: startX, y: endPos.y},
            {x: startX, y: startY} // 闭合路径
        ];
    
        this.drawCtx.beginPath();
        points.forEach((p, i) => {
            const {canvasX, canvasY} = this.convertToCanvasCoords(p);
            if (i === 0) this.drawCtx.moveTo(canvasX, canvasY);
            else this.drawCtx.lineTo(canvasX, canvasY);
        });
        this.drawCtx.stroke();
}

    // 新增圆形绘制方法
    drawCircle(endPos) {
        const startX = this.currentPath.startX;
        const startY = this.currentPath.startY;
        const radius = Math.sqrt(
            Math.pow(endPos.x - startX, 2) + 
            Math.pow(endPos.y - startY, 2)
        );
    
        const center = this.convertToCanvasCoords({x: startX, y: startY});
        this.drawCtx.beginPath();
        this.drawCtx.arc(center.canvasX, center.canvasY, radius * this.scale, 0, 2 * Math.PI);
        this.drawCtx.stroke();
}

    // 新增生成圆形点的方法
    generateCirclePoints(cx, cy, r, segments=36) {
        const points = [];
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            points.push({
                x: cx + r * Math.cos(angle),
                y: cy + r * Math.sin(angle)
            });
        }
        return points;
}

    // 新增高亮方法
    highlightContour(groupId, pathIndex) {
        this.highlightedGroupId = groupId;
        this.highlightedPathIndex = pathIndex;
        this.redrawPaths();
}

    // 新增清除高亮方法
    clearHighlight() {
        this.highlightedGroupId = null;
        this.highlightedPathIndex = null;
        this.redrawPaths();
}
    // 新增颜色调整方法
    adjustColor(hex, percent) {
        const num = parseInt(hex.replace("#",""), 16);
        const amt = Math.round(2.55 * percent);
        const r = (num >> 16) + amt;
        const g = (num >> 8 & 0x00FF) + amt;
        const b = (num & 0x0000FF) + amt;
        return `#${(1 << 24 | (r < 255 ? r < 1 ? 0 : r : 255) << 16 | 
                (g < 255 ? g < 1 ? 0 : g : 255) << 8 | 
                (b < 255 ? b < 1 ? 0 : b : 255)).toString(16).slice(1)}`;
}

    // 在SVSViewer类中添加新方法：
    exportGroup(groupId) {
        const group = this.groups.find(g => g.id === groupId);
        if (!group || group.paths.length === 0) return;
    
        // 显示覆盖层
        const overlay = document.getElementById('exportOverlay');
        const progressBar = document.getElementById('exportProgressBar');
        const percentage = document.getElementById('exportPercentage');
        const completeBtn = document.getElementById('exportCompleteBtn');
        
        overlay.style.display = 'block';
        progressBar.style.width = '0%';
        percentage.textContent = '0%';
        completeBtn.disabled = true;
    
        // 锁定界面
        this.lockInterface(true);
    
        // 收集所有可见路径
        const visiblePaths = group.paths.filter(p => p.visible);
        const total = visiblePaths.length;
        let completed = 0;
    
        visiblePaths.forEach((path, index) => {

            // 计算单个轮廓的边界框
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            path.points.forEach(p => {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x);
                maxY = Math.max(maxY, p.y);
            });
    
            // 转换为最高层级坐标
            const level0Width = this.dimensions[0][0];
            const currentLevelWidth = this.dimensions[this.currentLevel][0];
            const scaleRatio = level0Width / currentLevelWidth;
    
            // 构造导出参数
            const exportParams = {
                filename: this.filename,
                groupId: groupId,
                groupTitle: group.title,
                contourName: path.name,
                x: Math.floor(minX * scaleRatio),
                y: Math.floor(minY * scaleRatio),
                width: Math.ceil((maxX - minX) * scaleRatio),
                height: Math.ceil((maxY - minY) * scaleRatio),
                level: 0,
                contourPoints: path.points.map(p => ({
                    x: Math.round(p.x * scaleRatio),
                    y: Math.round(p.y * scaleRatio)
                })) // 新增轮廓点参数
            };
    
            // 发送导出请求
            fetch('/export_region', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(exportParams)
            })
            .then(response => response.json())
            .then(data => {
                completed++;
                // 更新进度
                const percent = Math.round((completed / total) * 100);
                progressBar.style.width = `${percent}%`;
                percentage.textContent = `${percent}%`;
    
                // 全部完成时
                if (completed === total) {
                    completeBtn.disabled = false;
                    this.lockInterface(false);
                }
            })
            .catch(error => {
                console.error('导出失败:', error);
                completed++; // 即使失败也计入进度
                // 更新进度（即使有错误也继续）
                const percent = Math.round((completed / total) * 100);
                progressBar.style.width = `${percent}%`;
                percentage.textContent = `${percent}%`;
            });
        });
    }
        // 新增方法：锁定/解锁界面
    lockInterface(locked) {
        const elements = document.querySelectorAll('button, input, select');
        elements.forEach(el => {
            el.disabled = locked;
        });
    
        if (locked) {
            document.body.style.pointerEvents = 'none';
            document.body.style.cursor = 'wait';
        } else {
            document.body.style.pointerEvents = 'auto';
            document.body.style.cursor = 'default';
        }
}
    // 在SVSViewer类中添加方法
    toggleOverview() {
        this.showOverview = !this.showOverview;
        document.querySelector('.overview-container').style.display = 
        this.showOverview ? 'block' : 'none';
        if(this.showOverview) this.initOverview();
    }

    async initOverview() {
        // 使用最低分辨率层级
        const level = this.levels - 1;
        const [width, height] = this.dimensions[level];
    
        try {
            const response = await fetch('/get_tile', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                filename: this.filename,
                level: level,
                x: 0,
                y: 0,
                width: width,
                height: height
            })
        });
        
        const data = await response.json();
        if(data.error) throw new Error(data.error);

        const img = new Image();
        img.onload = () => {
            // 新增：根据原图比例动态计算画布尺寸
            const aspectRatio = width / height;
            const canvasWidth = 200;  // 固定宽度
            const canvasHeight = canvasWidth / aspectRatio;  // 按比例计算高度
            
            this.overviewCanvas.width = canvasWidth;
            this.overviewCanvas.height = canvasHeight;  // 修改此行

            this.overviewCtx.imageSmoothingEnabled = true;
            this.overviewCtx.imageSmoothingQuality = 'high';
            this.overviewCtx.drawImage(img, 0, 0, canvasWidth, canvasHeight);  // 修改此行
            this.updateViewportIndicator();
        };
        img.src = 'data:image/jpeg;base64,' + data.image;
    } catch(error) {
        console.error('加载鸟瞰图失败:', error);
    }
}

    updateViewportIndicator() {
    if (!this.showOverview) return;

    // 1. 动态计算鸟瞰图容器尺寸（保持原图比例）
    const overviewContainer = document.querySelector('.overview-container');
    const containerWidth = overviewContainer.clientWidth; // 实际容器宽度（通常为200px）
    const overviewLevel = this.levels - 1;
    const [overviewWidth, overviewHeight] = this.dimensions[overviewLevel];
    const aspectRatio = overviewWidth / overviewHeight;
    const canvasHeight = containerWidth / aspectRatio; // 按比例计算高度

    // 2. 更新画布尺寸（确保正确显示比例）
    this.overviewCanvas.style.width = `${containerWidth}px`;
    this.overviewCanvas.style.height = `${canvasHeight}px`;

    // 3. 计算各方向缩放比例
    const canvasScaleX = containerWidth / overviewWidth;  // X方向缩放比例
    const canvasScaleY = canvasHeight / overviewHeight;  // Y方向缩放比例

    // 4. 转换当前视口坐标到鸟瞰图坐标系
    const currentLevelWidth = this.dimensions[this.currentLevel][0];
    const currentLevelHeight = this.dimensions[this.currentLevel][1];
    
    const viewX = this.posX * (overviewWidth / currentLevelWidth) * canvasScaleX;
    const viewY = this.posY * (overviewHeight / currentLevelHeight) * canvasScaleY;

    // 5. 转换视口尺寸（分离XY缩放比例）
    const viewWidth = (this.canvas.width / this.scale) * (overviewWidth / currentLevelWidth) * canvasScaleX;
    const viewHeight = (this.canvas.height / this.scale) * (overviewHeight / currentLevelHeight) * canvasScaleY;

    // 6. 应用样式（动态约束范围）
    this.viewportIndicator.style.width = `${Math.max(2, viewWidth)}px`;
    this.viewportIndicator.style.height = `${Math.max(2, viewHeight)}px`;
    
    // 7. 最终位置约束（使用动态计算的canvasHeight）
    const finalX = Math.min(containerWidth - viewWidth, Math.max(0, viewX));
    const finalY = Math.min(canvasHeight - viewHeight, Math.max(0, viewY));
    
    this.viewportIndicator.style.transform = `translate(${finalX}px, ${finalY}px)`;
}
    // script.js 在SVSViewer类中添加新方法
    hasGroupWithCurrentColor() {
        return this.groups.some(g => g.color.toLowerCase() === this.drawColor.toLowerCase());
    }

    updateCreateButtonState() {
        const createBtn = document.getElementById('createGroup');
        createBtn.disabled = this.hasGroupWithCurrentColor();
    }

    
}
    


// 初始化查看器
document.addEventListener('DOMContentLoaded', () => {
    new SVSViewer();
});