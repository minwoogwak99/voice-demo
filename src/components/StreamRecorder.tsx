import { useMicVAD } from "@ricky0123/vad-react";
import { Loader2, Mic, MicOff } from "lucide-react";
import OpenAI from "openai";
import { useCallback, useRef, useState } from "react";
import { Button } from "./ui/button";

type StreamRecorderProps = {
  onTranscription: (text: string, language: string) => void;
  onError: (error: string) => void;
};

export function StreamRecorder({
  onTranscription,
  onError,
}: StreamRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const openai = new OpenAI({
    apiKey: import.meta.env.VITE_OPENAI_API_KEY,
    dangerouslyAllowBrowser: true,
  });

  const vad = useMicVAD({
    model: "v5",
    startOnLoad: false,
    onSpeechStart: () => {
      setIsRecording(true);
      console.log("Speech started");
    },
    onSpeechEnd: () => {
      setIsRecording(false);
      console.log("Speech ended");
    },
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

  const startRecording = useCallback(() => {
    vad.start();
  }, [vad]);

  const stopRecording = useCallback(() => {
    vad.pause();
    setIsRecording(false);
  }, [vad]);

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
              return "Streaming... Click to stop";
            }
            return "Click to start streaming";
          })()}
        </p>
        {isRecording && <p className="mt-1 text-red-500 text-xs">🔴 Live</p>}
      </div>
    </div>
  );
}
