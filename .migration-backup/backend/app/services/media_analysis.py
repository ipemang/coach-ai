"""COA-107: Media analysis service — AI form/technique analysis for WhatsApp media.

Handles:
- Image analysis: sends image bytes directly to vision LLM
- Video analysis: extracts 6-8 key frames with ffmpeg, sends as image sequence
- Returns raw AI analysis (pre-InteractionAgent) for coach review
"""
from __future__ import annotations

import base64
import io
import logging
import os
import tempfile
from dataclasses import dataclass

logger = logging.getLogger(__name__)

_MAX_IMAGE_SIZE_MB = 5
_MAX_VIDEO_SIZE_MB = 16
_FRAME_COUNT = 7          # frames to extract from video


@dataclass
class MediaAnalysisResult:
    analysis: str
    frames_extracted: int = 0


def _image_to_base64(image_bytes: bytes) -> str:
    return base64.standard_b64encode(image_bytes).decode("utf-8")


def _extract_video_frames(video_bytes: bytes, n_frames: int = _FRAME_COUNT) -> list[bytes]:
    """Extract n_frames evenly-spaced frames from video_bytes using ffmpeg-python.

    Falls back to [] if ffmpeg is unavailable (Railway image without ffmpeg).
    Returns list of JPEG bytes.
    """
    try:
        import ffmpeg  # type: ignore
    except ImportError:
        logger.warning("[COA-107] ffmpeg-python not installed — cannot extract frames")
        return []

    frames = []
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp_in:
        tmp_in.write(video_bytes)
        tmp_in_path = tmp_in.name

    with tempfile.TemporaryDirectory() as tmp_dir:
        frame_pattern = os.path.join(tmp_dir, "frame_%03d.jpg")
        try:
            # Probe duration first
            try:
                probe = ffmpeg.probe(tmp_in_path)
                duration = float(probe["format"].get("duration", 0))
            except Exception:
                duration = 0

            # Build fps arg to extract ~n_frames total
            if duration > 0:
                fps = n_frames / duration
                (
                    ffmpeg
                    .input(tmp_in_path)
                    .filter("fps", fps=fps)
                    .output(frame_pattern, vframes=n_frames, format="image2", vcodec="mjpeg")
                    .overwrite_output()
                    .run(capture_stdout=True, capture_stderr=True, quiet=True)
                )
            else:
                # Unknown duration — extract by frame number
                (
                    ffmpeg
                    .input(tmp_in_path)
                    .filter("select", f"not(mod(n,3))")
                    .output(frame_pattern, vsync=0, vframes=n_frames, vcodec="mjpeg")
                    .overwrite_output()
                    .run(capture_stdout=True, capture_stderr=True, quiet=True)
                )

            for fname in sorted(os.listdir(tmp_dir))[:n_frames]:
                with open(os.path.join(tmp_dir, fname), "rb") as f:
                    frames.append(f.read())
        except Exception as exc:
            logger.warning("[COA-107] ffmpeg frame extraction failed: %s", exc)
        finally:
            try:
                os.unlink(tmp_in_path)
            except OSError:
                pass

    return frames


def analyze_media(
    media_bytes: bytes,
    media_type: str,           # 'image' | 'video'
    athlete_name: str,
    sport: str | None,
    methodology_summary: str | None,
    persona_prompt: str | None,
    llm_provider: str | None = None,
) -> MediaAnalysisResult:
    """Run vision LLM analysis on the media.

    Returns a MediaAnalysisResult with the raw AI analysis text.
    This is the ExecutionAgent layer — no personality, just facts.
    The InteractionAgent caller wraps this in the coach's voice.
    """
    from app.services.llm_client import LLMClient

    sport_label = sport or "endurance sports"
    methodology_ctx = (
        f"Coach's methodology context: {methodology_summary[:500]}"
        if methodology_summary else ""
    )

    system_prompt = f"""You are analyzing athletic form and technique for a coach.
Sport: {sport_label}
{methodology_ctx}

Analyze the provided {'image' if media_type == 'image' else 'video frames'} for athlete {athlete_name}.

Structure your analysis as:
1. **Key observations** — what you see (body position, form, alignment, cadence, posture)
2. **Areas to improve** — specific technique issues if any
3. **Positive elements** — reinforce what's good

Keep total length under 200 words. Be specific — name body parts, angles, positions.
Do NOT include greetings, sign-offs, or coaching advice beyond what you observe.
Output plain text only (no markdown)."""

    # Build the content blocks for the LLM
    if media_type == "image":
        b64 = _image_to_base64(media_bytes)
        content_blocks = [
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{b64}", "detail": "high"},
            },
            {"type": "text", "text": f"Analyze this athlete image for {sport_label} form."},
        ]
        frames_extracted = 1
    else:
        # Video — extract frames
        frames = _extract_video_frames(media_bytes)
        if not frames:
            return MediaAnalysisResult(
                analysis="Video received but frame extraction is not available on this server. "
                         "The coach can view the video directly and add manual notes.",
                frames_extracted=0,
            )

        content_blocks = []
        for i, frame_bytes in enumerate(frames):
            b64 = _image_to_base64(frame_bytes)
            content_blocks.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{b64}", "detail": "low"},
            })
        content_blocks.append({
            "type": "text",
            "text": f"Analyze these {len(frames)} video frames for {sport_label} form and technique.",
        })
        frames_extracted = len(frames)

    # Call LLM with vision content
    llm = LLMClient(provider=llm_provider or os.environ.get("LLM_PROVIDER"))
    try:
        resp = llm.complete_with_vision(
            system_prompt=system_prompt,
            content_blocks=content_blocks,
            max_tokens=400,
        )
        raw_analysis = resp.content.strip()
    except AttributeError:
        # LLMClient doesn't have complete_with_vision — fall back to standard complete
        # with a text-only description (graceful degradation)
        logger.warning("[COA-107] Vision API not available on this LLMClient — using text fallback")
        text_prompt = (
            f"A coach needs a form analysis note for {athlete_name} who sent a {media_type}. "
            f"Sport: {sport_label}. "
            "Write a placeholder: 'Media received. Please review directly and add your notes.'"
        )
        resp = llm.complete(
            system_prompt=system_prompt,
            user_prompt=text_prompt,
            max_tokens=100,
        )
        raw_analysis = resp.content.strip()

    # Now wrap with InteractionAgent (coach voice) if persona prompt is available
    if persona_prompt and raw_analysis:
        try:
            interaction_prompt = (
                f"Rewrite this form analysis in my coaching voice, "
                f"still factual but with my personal style:\n\n{raw_analysis}"
            )
            voice_resp = llm.complete(
                system_prompt=persona_prompt,
                user_prompt=interaction_prompt,
                max_tokens=400,
            )
            raw_analysis = voice_resp.content.strip() or raw_analysis
        except Exception as exc:
            logger.warning("[COA-107] InteractionAgent wrap failed: %s", exc)

    return MediaAnalysisResult(analysis=raw_analysis, frames_extracted=frames_extracted)
