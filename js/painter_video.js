import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "Painter.VideoCombine",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "PainterVideoCombine") return;

        // --- 1. Drawing Logic ---
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

        // --- Helper: Calculate Header Height Precisely ---
        function getHeaderAndWidgetHeight(node) {
            let height = 24; // Title bar base
            if (node.widgets) {
                for (const w of node.widgets) {
                    if (w.name !== "painter_preview" && w.type !== "hidden") {
                        // Standard widget height + small gap
                        height += (w.computeSize ? w.computeSize(node.size[0])[1] : 20) + 18;
                    }
                }
            }
            return height;
        }

        function findVideoElement(node) {
            if (!node.widgets) return null;
            for (const w of node.widgets) {
                if (w.element?.tagName === "VIDEO") return w.element;
                const vid = w.element?.querySelector("video");
                if (vid) return vid;
            }
            return null;
        }

        // --- 2. Context Menu (Custom Features) ---
        const getExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
        nodeType.prototype.getExtraMenuOptions = function (_, options) {
            getExtraMenuOptions?.apply(this, arguments);
            const video = findVideoElement(this);
            const newOptions = [];

            newOptions.push({
                content: "Save Preview",
                callback: () => {
                    const params = this.properties["painter_output_cache"];
                    if (params) {
                        const url = api.apiURL(`/view?filename=${params.filename}&subfolder=${params.subfolder}&type=${params.type}`);
                        const a = document.createElement("a");
                        a.href = url; a.download = params.filename;
                        document.body.appendChild(a); a.click(); document.body.removeChild(a);
                    }
                }
            });

            newOptions.push({
                content: (video && video.paused) ? "Resume Preview" : "Pause Preview",
                callback: () => { if (video) video.paused ? video.play() : video.pause(); }
            });

            newOptions.push({
                content: "Sync Preview",
                callback: () => {
                    if (video) {
                        video.pause();
                        video.currentTime = 0;
                        video.load(); 
                        video.play();
                    }
                }
            });

            if (options.length > 0) newOptions.push(null);
            options.unshift(...newOptions);
        };

        // --- 3. Strict Border Fitting Logic ---
        nodeType.prototype.onResize = function (size) {
            if (this.painter_aspect) {
                const headHeight = getHeaderAndWidgetHeight(this);
                // Calculate target height based on current width and video aspect ratio
                const targetVideoHeight = size[0] / this.painter_aspect;
                const totalHeight = Math.ceil(headHeight + targetVideoHeight);

                // Lock node height to the calculated value to prevent gaps or overflow
                if (Math.abs(size[1] - totalHeight) > 0.5) {
                    size[1] = totalHeight;
                }
            }
            
            const widget = this.widgets?.find(w => w.name === "painter_preview");
            if (widget?.element) {
                // Ensure DOM element covers the remaining area perfectly
                widget.element.style.width = `${size[10]}px`;
                const contentH = size[1] - getHeaderAndWidgetHeight(this);
                widget.element.style.height = `${contentH}px`;
            }
        };

        // --- 4. Execution & State Persistence ---
        nodeType.prototype.onExecuted = function (message) {
            if (message?.painter_output) {
                this.properties["painter_output_cache"] = message.painter_output[0];
                updateVideoPreview(this, message.painter_output[0]);
            }
        };

        nodeType.prototype.onConfigure = function () {
            if (this.properties?.["painter_output_cache"]) {
                updateVideoPreview(this, this.properties["painter_output_cache"]);
            }
        };

        // --- 5. Video UI Implementation ---
        function updateVideoPreview(node, data) {
            let widget = node.widgets?.find(w => w.name === "painter_preview");
            
            if (!widget) {
                const element = document.createElement("div");
                element.style.display = "flex";
                element.style.justifyContent = "center";
                element.style.alignItems = "center";
                element.style.padding = "0px";
                element.style.margin = "0px";
                element.style.overflow = "hidden"; // Prevents video from bleeding out
                element.style.boxSizing = "border-box";
                
                widget = node.addDOMWidget("painter_preview", "preview", element, {
                    serialize: false, hideOnZoom: false
                });
            }

            const url = api.apiURL(`/view?filename=${data.filename}&subfolder=${data.subfolder}&type=${data.type}`);
            widget.element.innerHTML = "";

            const video = document.createElement("video");
            video.src = url;
            video.controls = false; 
            video.loop = true; 
            video.autoplay = true; 
            video.muted = true;
            
            // Critical: object-fit cover ensures no micro-gaps at the edges
            video.style.width = "100%";
            video.style.height = "100%";
            video.style.objectFit = "cover"; 
            video.style.display = "block";

            // Context Menu Redirection
            const triggerCtx = (e) => {
                e.preventDefault(); e.stopPropagation();
                if (app.canvas.processContextMenu) app.canvas.processContextMenu(node, e);
                else app.canvas._mousedown_callback(e);
                return false;
            };
            video.addEventListener('contextmenu', triggerCtx, true);
            video.addEventListener('pointerdown', (e) => { if (e.button === 2) triggerCtx(e); }, true);

            // Audio on Hover
            video.addEventListener('mouseenter', () => { video.muted = false; });
            video.addEventListener('mouseleave', () => { video.muted = true; });

            video.onloadedmetadata = () => {
                if (video.videoWidth && video.videoHeight) {
                    node.painter_aspect = video.videoWidth / video.videoHeight;
                    // Trigger refit immediately
                    node.onResize(node.size);
                    node.setDirtyCanvas(true, true);
                }
            };

            widget.element.appendChild(video);
        }
    }
});
