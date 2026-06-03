# svs-viewer
这是一个基于Flask+OpenSlide的svs数字病历切片查看、标注与导出系统。支持金字塔层级缩放平移，鸟瞰导航;自由/矩形/圆形三种轮廓标注模式，快捷键切换，轮廓可见性管理辅助绘制;可分组导出高清jpeg格式文件并可带蒙版，以及导出ASAP XML文件增加联动。 实现完整标注工作流。 此系统具有轻量化免部署，易上手的显著有点，降低病理图像查看门槛。
在运行终端配置好运行环境:

软件准备：默认必备的软件Microsoft Edge浏览器和Visual Studio Code (VS Code)代码编辑器，其他浏览器与编辑器大部分均可运行项目，可自行尝试。
语言环境：终端必须能够运行python程序，下载python解释器（https://www.python.org/downloads/）
环境变量：在OpenSlide官网中（https://openslide.org），根据自己的操作系统下载openslide二进制包，解压到自拟路径，在环境变量中用户变量中的Path中添加解压缩路径，记得加上\bin，重启。
配置VS Code：下载python插件，确保VS Code可以运行python程序，运行requirments.txt文件，ctrl+shift+~键打开TERMINAL，输入pip install -r requirments.txt下载各项配置。
修改app.py文件：解压后的app.py文件中，openslide_bin_path = r"C:\openslide-bin-4.0.0.6-windows-x64\bin"改为自拟的解压路径。

注意：本系统只适用于windows环境下运行
