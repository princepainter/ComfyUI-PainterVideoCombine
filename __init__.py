from .nodes import PainterVideoCombine

# 节点映射
NODE_CLASS_MAPPINGS = {
    "PainterVideoCombine": PainterVideoCombine
}


NODE_DISPLAY_NAME_MAPPINGS = {
    "PainterVideoCombine": "Painter Video Combine"
}


WEB_DIRECTORY = "./js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
