"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MIN_RECORD_MS = 1200;
const TIMESLICE_MS = 250;
const STOP_FLUSH_MS = 200;

interface UseVoiceRecorderOptions {
  onTranscript: (text: string) => void | Promise<void>;
  onError?: (message: string) => void;
}

export function useVoiceRecorder({ onTranscript, onError }: UseVoiceRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecordingSeconds(0);
    recordingStartedAtRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      clearTimer();
      stopStream();
    };
  }, [clearTimer, stopStream]);

  const transcribeBlob = useCallback(
    async (blob: Blob, durationMs: number) => {
      if (durationMs < MIN_RECORD_MS) {
        onError?.("Recording was too short. Keep the mic on until you finish the full phone number.");
        return;
      }

      setIsTranscribing(true);
      try {
        const formData = new FormData();
        formData.append("audio", blob, `recording.${blob.type.includes("webm") ? "webm" : "wav"}`);

        const response = await fetch("/api/agent/transcribe", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Transcription failed");
        }

        const text = String(data.text ?? "").trim();
        if (!text) {
          throw new Error("No speech detected. Please try again.");
        }

        await onTranscript(text);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Transcription failed";
        onError?.(message);
      } finally {
        setIsTranscribing(false);
      }
    },
    [onError, onTranscript],
  );

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }

    const durationMs = recordingStartedAtRef.current
      ? Date.now() - recordingStartedAtRef.current
      : 0;

    clearTimer();
    setIsRecording(false);

    recorder.onstop = () => {
      stopStream();
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      chunksRef.current = [];
      mediaRecorderRef.current = null;

      if (blob.size > 0) {
        void transcribeBlob(blob, durationMs);
      } else {
        onError?.("No audio captured. Please try again.");
      }
    };

    if (typeof recorder.requestData === "function") {
      recorder.requestData();
    }

    window.setTimeout(() => {
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
    }, STOP_FLUSH_MS);
  }, [clearTimer, onError, stopStream, transcribeBlob]);

  const startRecording = useCallback(async () => {
    if (isRecording || isTranscribing) return;
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      onError?.("Microphone is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      chunksRef.current = [];

      const preferredTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/wav"];
      const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        stopStream();
        clearTimer();
        setIsRecording(false);
        onError?.("Recording failed. Please try again.");
      };

      recordingStartedAtRef.current = Date.now();
      timerRef.current = setInterval(() => {
        if (recordingStartedAtRef.current) {
          setRecordingSeconds(Math.floor((Date.now() - recordingStartedAtRef.current) / 1000));
        }
      }, 500);

      recorder.start(TIMESLICE_MS);
      setIsRecording(true);
    } catch (error: unknown) {
      stopStream();
      clearTimer();
      const message =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone permission denied. Allow mic access and try again."
          : "Could not access microphone.";
      onError?.(message);
    }
  }, [clearTimer, isRecording, isTranscribing, onError, stopStream]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      void startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  return {
    isRecording,
    isTranscribing,
    recordingSeconds,
    toggleRecording,
    stopRecording,
  };
}
