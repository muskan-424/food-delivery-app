import { appConfig } from "../config/appConfig.js";

const MAX_AUDIO_BYTES = Number(process.env.VOICE_MAX_AUDIO_BYTES) > 0
  ? Number(process.env.VOICE_MAX_AUDIO_BYTES)
  : 2 * 1024 * 1024;

export function getVoiceMaxAudioBytes() {
  return MAX_AUDIO_BYTES;
}

/**
 * MVP STT: stub transcript metadata. Replace with Whisper / Google STT in production.
 */
export async function transcribeAudioBuffer({ buffer, filename, languageHint = "auto", mockText }) {
  if (mockText && appConfig.voiceAllowMockText) {
    return {
      text: String(mockText).trim(),
      language: languageHint,
      provider: "mock_text",
    };
  }

  const size = buffer?.length || 0;
  if (size > MAX_AUDIO_BYTES) {
    const err = new Error("file_too_large");
    err.maxBytes = MAX_AUDIO_BYTES;
    throw err;
  }

  if (size < 16) {
    const err = new Error("file_too_small");
    throw err;
  }

  return {
    text: `[stub transcript from ${filename || "audio"}; bytes=${size}]`,
    language: languageHint,
    provider: "stub",
    note: "Integrate Whisper, Google STT, or Gemini multimodal for production.",
  };
}
