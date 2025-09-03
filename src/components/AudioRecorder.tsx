import { Loader2, Mic, MicOff } from "lucide-react";
import OpenAI from "openai";
import { useCallback, useRef, useState } from "react";
import { Button } from "./ui/button";

type AudioRecorderProps = {
  onTranscription: (text: string, language: string) => void;
  onError: (error: string) => void;
};

export function AudioRecorder({
  onTranscription,
  onError,
}: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const openai = new OpenAI({
    apiKey: import.meta.env.VITE_OPENAI_API_KEY,
    dangerouslyAllowBrowser: true,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: ""
  const transcribeAudio = useCallback(
    async (audioBlob: Blob) => {
      try {
        const audioFile = new File([audioBlob], "audio.webm", {
          type: "audio/webm",
        });

        const transcription = await openai.audio.transcriptions.create({
          file: audioFile,
          model: "whisper-1",
          response_format: "verbose_json",
        });

        if (transcription.text?.trim()) {
          onTranscription(
            transcription.text,
            transcription.language || "unknown"
          );
        }
      } catch {
        onError("Failed to transcribe audio. Please try again.");
      } finally {
        setIsProcessing(false);
      }
    },
    [onTranscription, onError]
  );

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16_000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, {
          type: "audio/webm;codecs=opus",
        });
        await transcribeAudio(audioBlob);

        // Stop all audio tracks
        for (const track of stream.getTracks()) {
          track.stop();
        }
      };

      const RECORDING_INTERVAL = 1000; // Collect data every second
      mediaRecorder.start(RECORDING_INTERVAL);
      setIsRecording(true);
    } catch {
      onError(
        "Failed to access microphone. Please ensure microphone permissions are granted."
      );
    }
  }, [transcribeAudio, onError]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsProcessing(true);
    }
  }, []);

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="flex flex-col items-center space-y-4">
      <Button
        className={`relative h-16 w-16 rounded-full transition-colors duration-200 ${
          isRecording
            ? "bg-red-500 hover:bg-red-600"
            : "bg-blue-500 hover:bg-blue-600"
        }`}
        disabled={isProcessing}
        onClick={toggleRecording}
        size="lg"
      >
        {(() => {
          if (isProcessing) {
            return <Loader2 className="h-6 w-6 animate-spin text-white" />;
          }
          if (isRecording) {
            return <MicOff className="h-6 w-6 text-white" />;
          }
          return <Mic className="h-6 w-6 text-white" />;
        })()}
      </Button>

      <div className="text-center">
        <p className="text-gray-600 text-sm">
          {(() => {
            if (isProcessing) {
              return "Processing audio...";
            }
            if (isRecording) {
              return "Recording... Click to stop";
            }
            return "Click to start recording";
          })()}
        </p>
        {isRecording && <p className="mt-1 text-red-500 text-xs">🔴 Live</p>}
      </div>
    </div>
  );
}
