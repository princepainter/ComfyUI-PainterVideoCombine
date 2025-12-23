import os
import subprocess
import numpy as np
import folder_paths
import tempfile
import soundfile as sf
from comfy.utils import ProgressBar

try:
    import imageio_ffmpeg
    ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
except ImportError:
    ffmpeg_path = "ffmpeg"


class PainterVideoCombine:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE", ),
                "frame_rate": ("FLOAT", {"default": 24, "min": 1, "max": 120, "step": 0.1, "display": "number"}),
                "format": (["video/h264-mp4", "video/webm", "image/gif"],),
                "filename_prefix": ("STRING", {"default": "Painter_Video"}),
            },
            "optional": {
                "audio": ("AUDIO",),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("filename",)
    OUTPUT_NODE = True
    CATEGORY = "Painter/Video"
    FUNCTION = "combine_video"

    def combine_video(self, images, frame_rate, format, filename_prefix="Painter", audio=None):
        pbar = ProgressBar(len(images))
        output_dir = folder_paths.get_output_directory()
        full_output_folder, filename, counter, subfolder, _ = folder_paths.get_save_image_path(
            filename_prefix, output_dir, images[0].shape[1], images[0].shape[0]
        )

        ext = "mp4" if "mp4" in format else ("webm" if "webm" in format else "gif")
        file_name = f"{filename}_{counter:05}_.{ext}"
        file_path = os.path.join(full_output_folder, file_name)

        images_np = (images.cpu().numpy() * 255).astype(np.uint8)
        n, h, w, c = images_np.shape
        w, h = (w // 2) * 2, (h // 2) * 2

        # Add -v quiet to suppress all FFmpeg logs
        args = [
            ffmpeg_path, "-v", "quiet", "-y",
            "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}", "-r", str(frame_rate), "-i", "-"
        ]

        audio_temp_path = None
        if audio is not None:
            try:
                wav_tensor = audio['waveform']
                wav_data = wav_tensor[0].cpu().numpy().transpose() if len(wav_tensor.shape) == 3 else wav_tensor.cpu().numpy().transpose()
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_audio:
                    sf.write(temp_audio.name, wav_data, audio['sample_rate'], format='WAV')
                    audio_temp_path = temp_audio.name
                args += ["-i", audio_temp_path]
            except:
                pass

        if ext == "mp4":
            args += ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "faster"]
            if audio_temp_path:
                args += ["-c:a", "aac", "-shortest"]
        elif ext == "webm":
            args += ["-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0"]
            if audio_temp_path:
                args += ["-c:a", "libvorbis", "-shortest"]
        else:
            args += ["-vf", "split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse"]

        args.append(file_path)

        # Suppress all stdout/stderr from FFmpeg
        process = subprocess.Popen(
            args,
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )

        for i, frame in enumerate(images_np):
            process.stdin.write(frame[:h, :w, :].tobytes())
            pbar.update(1)

        process.stdin.close()
        process.wait()

        if audio_temp_path and os.path.exists(audio_temp_path):
            os.remove(audio_temp_path)

        return {
            "ui": {"painter_output": [{"filename": file_name, "subfolder": subfolder, "type": "output"}]},
            "result": (file_name,)
        }
