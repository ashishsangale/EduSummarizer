from __future__ import annotations

import re
from urllib.parse import parse_qs, urlparse


def _load_transcript_api():
    try:
        from youtube_transcript_api import (
            CouldNotRetrieveTranscript,
            NoTranscriptFound,
            TranscriptsDisabled,
            VideoUnavailable,
            YouTubeTranscriptApi,
        )
        return {
            "CouldNotRetrieveTranscript": CouldNotRetrieveTranscript,
            "NoTranscriptFound": NoTranscriptFound,
            "TranscriptsDisabled": TranscriptsDisabled,
            "VideoUnavailable": VideoUnavailable,
            "YouTubeTranscriptApi": YouTubeTranscriptApi,
        }
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "youtube-transcript-api is not installed in the active Python environment. "
            "Install it with: python -m pip install youtube-transcript-api"
        ) from exc


class YoutubeTranscriptService:
    def extract_video_id(self, url: str) -> str:
        parsed = urlparse(url.strip())
        host = parsed.netloc.lower()

        if "youtu.be" in host:
            video_id = parsed.path.strip("/")
            if video_id:
                return video_id

        if "youtube.com" in host or "m.youtube.com" in host:
            if parsed.path == "/watch":
                query = parse_qs(parsed.query)
                video_id = query.get("v", [""])[0].strip()
                if video_id:
                    return video_id

            shorts_match = re.match(r"^/shorts/([A-Za-z0-9_-]{6,})", parsed.path)
            if shorts_match:
                return shorts_match.group(1)

            embed_match = re.match(r"^/embed/([A-Za-z0-9_-]{6,})", parsed.path)
            if embed_match:
                return embed_match.group(1)

        raise ValueError("Invalid YouTube URL. Please provide a valid video link.")

    def _fetch_segments(self, video_id: str) -> list[dict]:
        api = _load_transcript_api()
        CouldNotRetrieveTranscript = api["CouldNotRetrieveTranscript"]
        NoTranscriptFound = api["NoTranscriptFound"]
        TranscriptsDisabled = api["TranscriptsDisabled"]
        VideoUnavailable = api["VideoUnavailable"]
        YouTubeTranscriptApi = api["YouTubeTranscriptApi"]

        try:
            # Support both legacy and newer youtube-transcript-api interfaces.
            # Legacy versions expose class methods like list_transcripts/get_transcript,
            # while newer releases expose instance methods like list/fetch.
            if hasattr(YouTubeTranscriptApi, "list_transcripts"):
                transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)

                for preferred in (["en"], ["en-US"], ["en-GB"]):
                    try:
                        return transcript_list.find_transcript(preferred).fetch()
                    except Exception:
                        continue

                for preferred in (["en"], ["en-US"], ["en-GB"]):
                    try:
                        return transcript_list.find_generated_transcript(preferred).fetch()
                    except Exception:
                        continue

                for transcript in transcript_list:
                    return transcript.fetch()

                raise ValueError("No transcript tracks were found for this video.")

            if hasattr(YouTubeTranscriptApi, "get_transcript"):
                return YouTubeTranscriptApi.get_transcript(video_id, languages=["en", "en-US", "en-GB"])

            client = YouTubeTranscriptApi()
            if hasattr(client, "fetch"):
                fetched = client.fetch(video_id, languages=["en", "en-US", "en-GB"])
                if hasattr(fetched, "to_raw_data"):
                    return fetched.to_raw_data()
                return fetched

            if hasattr(client, "list"):
                transcript_list = client.list(video_id)

                for preferred in (["en"], ["en-US"], ["en-GB"]):
                    try:
                        return transcript_list.find_transcript(preferred).fetch()
                    except Exception:
                        continue

                for preferred in (["en"], ["en-US"], ["en-GB"]):
                    try:
                        return transcript_list.find_generated_transcript(preferred).fetch()
                    except Exception:
                        continue

                for transcript in transcript_list:
                    return transcript.fetch()

                raise ValueError("No transcript tracks were found for this video.")

            raise RuntimeError("Unsupported youtube-transcript-api version: no compatible transcript methods found")
        except (NoTranscriptFound, TranscriptsDisabled):
            raise ValueError(
                "No captions/transcript were found for this video. Try another video or upload audio manually."
            )
        except VideoUnavailable:
            raise ValueError("This YouTube video is unavailable.")
        except CouldNotRetrieveTranscript:
            raise ValueError("Unable to retrieve transcript for this video right now.")

    def fetch_transcript_text(self, url: str) -> tuple[str, str]:
        video_id = self.extract_video_id(url)
        segments = self._fetch_segments(video_id)

        text_parts: list[str] = []
        for segment in segments:
            piece = str(segment.get("text", "")).replace("\n", " ").strip()
            if piece:
                text_parts.append(piece)

        transcript = " ".join(text_parts).strip()
        if not transcript:
            raise ValueError("Transcript content was empty for this video.")

        default_name = f"youtube_{video_id}.txt"
        return transcript, default_name
