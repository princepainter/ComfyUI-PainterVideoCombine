import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "Painter.VideoCombine",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "PainterVideoCombine") return;

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

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);
            const node = this;

            const container = document.createElement("div");
            Object.assign(container.style, {
                width: "100%",
                background: "transparent", // Make background transparent
                display: "none",
                overflow: "hidden"
            });

            const video = document.createElement("video");
            Object.assign(video.style, {
                width: "100%",
                height: "auto",
                display: "block"
            });
            
            video.loop = true;
            video.muted = true;
            video.autoplay = true;

            video.addEventListener("mouseenter", () => video.muted = false);
            video.addEventListener("mouseleave", () => video.muted = true);

            video.addEventListener("loadedmetadata", () => {
                container.style.display = "block";
                node.painter_aspect = video.videoWidth / video.videoHeight;

                const baseHeight = 60;
                const videoHeight = node.size[0] / node.painter_aspect;
                const maxVideoHeight = 300;
                const totalHeight = baseHeight + Math.min(videoHeight, maxVideoHeight);

                node.setSize([node.size[0], totalHeight]);
                app.graph.setDirtyCanvas(true);
            });

            container.appendChild(video);

            this.addDOMWidget("painter_preview", "video", container, {
                serialize: false,
                getHeight: () => {
                    if (!node.painter_aspect) return 0;
                    let h = node.size[0] / node.painter_aspect;
                    const maxH = 300;
                    return Math.max(20, Math.min(h, maxH));
                }
            });

            this.painterVideo = video;
        };

        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            onExecuted?.apply(this, arguments);
            if (message?.painter_output && this.painterVideo) {
                const data = message.painter_output[0];
                const url = api.apiURL(`/view?filename=${encodeURIComponent(data.filename)}&subfolder=${encodeURIComponent(data.subfolder)}&type=${data.type}&t=${Date.now()}`);
                
                this.painter_aspect = null;
                this.painterVideo.src = url;
                this.painterVideo.load();
                this.painterVideo.play();
            }
        };
    }
});