import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "Painter.VideoCombine",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "PainterVideoCombine") return;

        // --- 1. 进度条绘制逻辑 ---
        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function (ctx) {
            onDrawForeground?.apply(this, arguments);
            if (this.progress > 0 && this.progress < 1) {
                ctx.save();
                ctx.fillStyle = "#FFD700";
                ctx.fillRect(0, -2, this.size[0] * this.progress, 4);
                ctx.restore();
            }
        };

        // --- 辅助函数：精准计算非视频区域高度 ---
        // 这里的数值经过微调，专门解决“留白太多”的问题
        function getHeaderAndWidgetHeight(node) {
            // 1. 基础标题栏高度：从 40 降为 30，更贴合标准
            let height = 30; 
            
            if (node.widgets) {
                for (const w of node.widgets) {
                    // 忽略视频预览控件自身
                    if (w.name !== "painter_preview") {
                        // w.computeSize 只有标准控件才有，通常返回 [width, 20]
                        // 如果没有 computeSize，默认给 20 (标准行高)
                        const wHeight = w.computeSize ? w.computeSize(node.size[0])[1] : 20;
                        
                        // 累加：控件高度 + LiteGraph 控件间的标准间距 (约 4px)
                        height += wHeight + 4;
                    }
                }
            }
            // 2. 底部边距：从 20 降为 6，仅保留圆角所需的最小空隙
            return height + 16; 
        }

        // --- 辅助函数：统一加载视频逻辑 ---
        function updateVideoPreview(node, data) {
            if (!node.painterVideo || !data) return;

            const url = api.apiURL(`/view?filename=${encodeURIComponent(data.filename)}&subfolder=${encodeURIComponent(data.subfolder)}&type=${data.type}&t=${Date.now()}`);
            
            node.painterVideo.src = url;
            node.painterVideo.load();
            node.painterVideo.muted = true;
            node.painterVideo.play();
        }

        // --- 2. 节点创建逻辑 ---
        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);
            const node = this;

            if (!this.properties) this.properties = {};

            const container = document.createElement("div");
            Object.assign(container.style, {
                width: "100%",
                background: "transparent",
                display: "flex",
                justifyContent: "center",
                alignItems: "flex-start", // 顶部对齐，防止被拉伸
                overflow: "hidden",
                pointerEvents: "none"
            });

            const video = document.createElement("video");
            Object.assign(video.style, {
                width: "100%",
                height: "auto",
                display: "block",      // 关键：Block 布局消除 inline 元素的 4px 幽灵底边距
                pointerEvents: "auto",
                objectFit: "contain"
            });
            
            video.loop = true;
            video.muted = true;
            video.autoplay = true;

            video.addEventListener("mouseenter", () => video.muted = false);
            video.addEventListener("mouseleave", () => video.muted = true);

            // --- 视频加载元数据 ---
            video.addEventListener("loadedmetadata", () => {
                if(video.videoWidth === 0) return;

                node.painter_aspect = video.videoWidth / video.videoHeight;
                
                // 强制触发一次 resize 来修正高度
                if (node.onResize) {
                    node.onResize(node.size);
                }
                app.graph.setDirtyCanvas(true);
            });

            container.appendChild(video);

            this.addDOMWidget("painter_preview", "video", container, {
                serialize: false,
                getHeight: () => {
                    if (!node.painter_aspect) return 0;
                    return node.size[0] / node.painter_aspect;
                }
            });

            this.painterVideo = video;

            // --- 3. Resize 逻辑 (精准控制版) ---
            const onResize = node.onResize;
            node.onResize = function (size) {
                onResize?.apply(this, arguments);

                if (this.painter_aspect) {
                    // 获取上方控件区高度 (已调优)
                    const otherWidgetsHeight = getHeaderAndWidgetHeight(this);
                    
                    // 计算视频区高度
                    const videoHeight = size[0] / this.painter_aspect;
                    
                    // 总高度
                    const totalHeight = otherWidgetsHeight + videoHeight;

                    // 只有当高度差异大于 1px 时才更新，避免浮点数抖动
                    if (Math.abs(size[1] - totalHeight) > 1) {
                        size[1] = totalHeight;
                    }
                }
            };
        };

        // --- 4. 执行完成后保存数据 ---
        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            onExecuted?.apply(this, arguments);
            if (message?.painter_output && this.painterVideo) {
                const data = message.painter_output[0];
                this.properties["painter_output_cache"] = data;
                updateVideoPreview(this, data);
            }
        };

        // --- 5. 页面加载恢复数据 ---
        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            onConfigure?.apply(this, arguments);
            if (this.properties && this.properties["painter_output_cache"]) {
                updateVideoPreview(this, this.properties["painter_output_cache"]);
            }
        };
    }
});
