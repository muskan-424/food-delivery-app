import React, { useContext, useRef, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { StoreContext } from "../../context/StoreContext";
import "./VoiceInputButton.css";

const VoiceInputButton = ({ onTranscript, disabled = false, languageHint = "auto" }) => {
  const { url, token } = useContext(StoreContext);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);

  const stopTracks = () => {
    mediaRef.current?.getTracks?.().forEach((t) => t.stop());
    mediaRef.current = null;
  };

  const startRecording = async () => {
    if (!token) {
      toast.error("Please sign in to use voice input");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Microphone not supported in this browser");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data?.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stopTracks();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size < 100) {
          toast.error("Recording too short — try again");
          return;
        }
        await uploadAudio(blob);
      };
      recorder.start();
      setRecording(true);
      window.__tomatoVoiceRecorder = recorder;
      setTimeout(() => {
        if (window.__tomatoVoiceRecorder === recorder && recorder.state === "recording") {
          recorder.stop();
          setRecording(false);
        }
      }, 8000);
    } catch {
      stopTracks();
      toast.error("Could not access microphone");
    }
  };

  const stopRecording = () => {
    const recorder = window.__tomatoVoiceRecorder;
    if (recorder && recorder.state === "recording") {
      recorder.stop();
    }
    setRecording(false);
  };

  const uploadAudio = async (blob) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("audio", blob, "voice.webm");
      form.append("languageHint", languageHint);
      const res = await axios.post(`${url}/api/voice/transcribe`, form, {
        headers: { token, "Content-Type": "multipart/form-data" },
      });
      const text = res.data?.data?.text || res.data?.data?.transcript || "";
      if (!text.trim()) {
        toast.error("Could not transcribe audio");
        return;
      }
      onTranscript?.(text.trim());
      toast.success("Voice captured");
    } catch (err) {
      toast.error(err.response?.data?.message || "Voice transcription failed");
    } finally {
      setUploading(false);
    }
  };

  const handleClick = () => {
    if (disabled || uploading) return;
    if (recording) stopRecording();
    else startRecording();
  };

  return (
    <button
      type="button"
      className={`voice-input-btn ${recording ? "recording" : ""}`}
      onClick={handleClick}
      disabled={disabled || uploading}
      title={recording ? "Stop recording" : "Hold to speak (max 8s)"}
      aria-label="Voice input"
    >
      {uploading ? "…" : recording ? "⏹" : "🎤"}
    </button>
  );
};

export default VoiceInputButton;
