import multer from "multer";
import { appConfig } from "../config/appConfig.js";
import {
  getVoiceMaxAudioBytes,
  transcribeAudioBuffer,
} from "../services/voiceTranscribeService.js";
import { sendError, sendSuccess } from "../utils/apiResponse.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: getVoiceMaxAudioBytes() },
});

export const voiceUploadMiddleware = upload.single("audio");

export const postVoiceTranscribe = async (req, res) => {
  try {
    if (!appConfig.enableVoiceAssist) {
      return sendError(res, req, 503, "Voice assist is disabled");
    }

    const languageHint = String(req.body.languageHint || req.query.languageHint || "auto").slice(0, 16);
    const mockText = req.body.mockText;

    if (!req.file && !mockText) {
      return sendError(res, req, 400, "audio file (field: audio) or mockText is required");
    }

    let result;
    try {
      result = await transcribeAudioBuffer({
        buffer: req.file?.buffer,
        filename: req.file?.originalname,
        languageHint,
        mockText,
      });
    } catch (e) {
      if (e.message === "file_too_large") {
        return sendError(res, req, 400, `Audio exceeds ${e.maxBytes} bytes limit`);
      }
      if (e.message === "file_too_small") {
        return sendError(res, req, 400, "Audio file is too small");
      }
      throw e;
    }

    return sendSuccess(res, req, 200, {
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("postVoiceTranscribe:", error);
    return sendError(res, req, 500, "Error transcribing audio");
  }
};
