# 在 app.py 最开头添加
import os
import sys
import time
import re
import json
from ctypes import CDLL

# 明确指定 DLL 路径
openslide_bin_path = r"C:\openslide-bin-4.0.0.6-windows-x64\bin"
dll_path = os.path.join(openslide_bin_path, "libopenslide-1.dll")

try:
    # 尝试直接加载 DLL
    CDLL(dll_path)
    os.add_dll_directory(openslide_bin_path)
except Exception as e:
    print(f"无法加载 OpenSlide DLL: {e}")
    print("请检查以下内容：")
    print(f"1. 路径 {dll_path} 是否存在")
    print("2. 是否有其他依赖 DLL 缺失（可以用 Dependency Walker 检查）")
    sys.exit(1)




from flask import Flask, render_template, request, jsonify, send_from_directory
from openslide import OpenSlide
from PIL import Image
import numpy as np
import io
import base64

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 1000 * 1024 * 1024  # 100MB limit

# 确保上传目录存在
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file part'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No selected file'}), 400
        
        # 验证文件扩展名
        if not file.filename.lower().endswith('.svs'):
            return jsonify({'error': 'Only SVS files are allowed'}), 400

        filepath = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
        
        # 确保目录存在
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        
        # 保存文件
        file.save(filepath)
        
        # 验证文件是否有效
        try:
            with OpenSlide(filepath) as slide:
                levels = slide.level_count
                dimensions = slide.level_dimensions
                
                thumb_level = levels - 1
                thumb_size = dimensions[thumb_level]
                thumb = slide.read_region((0, 0), thumb_level, thumb_size)
                thumb = thumb.convert('RGB')
                
                buffered = io.BytesIO()
                thumb.save(buffered, format="JPEG", quality=85)
                img_str = base64.b64encode(buffered.getvalue()).decode('utf-8')
                
                return jsonify({
                    'success': True,
                    'filename': file.filename,
                    'levels': levels,
                    'dimensions': dimensions,
                    'thumbnail': img_str
                })
        except Exception as e:
            # 删除无效文件
            if os.path.exists(filepath):
                os.remove(filepath)
            return jsonify({'error': f'Invalid SVS file: {str(e)}'}), 400
            
    except Exception as e:
        return jsonify({'error': f'Server error: {str(e)}'}), 500
        
@app.errorhandler(413)
def request_entity_too_large(error):
    max_size_mb = app.config['MAX_CONTENT_LENGTH'] / (1024 * 1024)
    return jsonify({
        'error': f'文件太大 (最大支持 {max_size_mb}MB)'
    }), 413

@app.route('/get_tile', methods=['POST'])
def get_tile():
    data = request.json
    filename = data['filename']
    level = int(data['level'])
    x = int(data['x'])
    y = int(data['y'])
    width = int(data['width'])
    height = int(data['height'])
    
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    
    try:
        with OpenSlide(filepath) as slide:
            # 读取指定区域
            img = slide.read_region((x, y), level, (width, height))
            img = img.convert('RGB')
            
            # 转换为base64
            buffered = io.BytesIO()
            img.save(buffered, format="JPEG", quality=85)
            img_str = base64.b64encode(buffered.getvalue()).decode('utf-8')
            
            return jsonify({'image': img_str})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
@app.route('/save_annotations', methods=['POST'])
def save_annotations():
    data = request.json
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], data['filename'])
    annotation_path = filepath + '.json'
    
    # 转换Map为可序列化格式
    serializable = {color: paths for color, paths in data['groups']}
    
    with open(annotation_path, 'w') as f:
        json.dump(serializable, f)
    return jsonify({'success': True})

@app.route('/load_annotations', methods=['GET'])
def load_annotations():
    filename = request.args.get('filename')
    annotation_path = os.path.join(app.config['UPLOAD_FOLDER'], filename + '.json')
    
    if os.path.exists(annotation_path):
        with open(annotation_path) as f:
            data = json.load(f)
            # 转换回Map格式
            return jsonify({'groups': [[k,v] for k,v in data.items()]})
    return jsonify({'groups': []})

# 在已有路由后添加
EXPORT_FOLDER = 'exports'
os.makedirs(EXPORT_FOLDER, exist_ok=True)

@app.route('/export_region', methods=['POST'])
def export_region():
    data = request.json
    try:
        filename = data['filename']
        group_id = data['groupId']
        x = data['x']
        y = data['y']
        width = data['width']
        height = data['height']
        level = data['level']

        # 获取分组信息并创建安全目录名
        group_title = data.get('groupTitle', 'unnamed')
        safe_group_dir = re.sub(r'[\\/*?:"<>|]', '_', group_title)[:50]
        group_dir = os.path.join(EXPORT_FOLDER, safe_group_dir)

        # 创建分组目录（如果不存在）
        os.makedirs(group_dir, exist_ok=True)
        
        # 处理轮廓名称
        contour_name = data.get('contourName', 'unnamed_contour')
        safe_contour = re.sub(r'[\\/*?:"<>|]', '_', contour_name)[:50]
        
        # 生成最终保存路径
        export_path = os.path.join(group_dir, f"{safe_contour}.jpg")
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        
        with OpenSlide(filepath) as slide:
            # 读取指定区域
            img = slide.read_region((x, y), level, (width, height))
            img = img.convert('RGB')

            # ▼▼▼▼ 新增蒙版处理代码 ▼▼▼▼
            from PIL import Image, ImageDraw
            
            # 创建蒙版（初始全黑）
            mask = Image.new('L', (width, height), 0)
            draw = ImageDraw.Draw(mask)
            
            try:
                # 获取轮廓点并转换坐标系
                contour_points = data.get('contourPoints', [])
                if len(contour_points) > 2:
                    # 转换为相对坐标（相对于导出区域）
                    points = [(p['x']-x, p['y']-y) for p in contour_points]
                    
                    # 绘制多边形蒙版
                    draw.polygon(points, fill=255)
                    
                    # 应用蒙版
                    img.putalpha(mask)
                    
                    # 合成黑色背景
                    background = Image.new('RGB', img.size, (0, 0, 0))
                    background.paste(img, (0, 0), img)
                    img = background
            except Exception as e:
                print(f"蒙版处理失败: {str(e)}，仍导出原始区域")
            # ▲▲▲▲ 新增代码结束 ▲▲▲▲

            # 保存为JPG
            img.save(export_path, "JPEG", quality=95)
            
            return jsonify({
                'success': True,
                'path': export_path
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
    


if __name__ == '__main__':
    app.run(debug=True, port=5000)