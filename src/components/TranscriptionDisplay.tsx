import { useEffect, useRef } from "react";

type Transcription = {
  id: string;
  text: string;
  language: string;
  timestamp: Date;
};

type TranscriptionDisplayProps = {
  transcriptions: Transcription[];
};

export function TranscriptionDisplay({
  transcriptions,
}: TranscriptionDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new transcriptions are added
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, []);

  const getLanguageFlag = (language: string): string => {
    const languageFlags: Record<string, string> = {
      english: "🇺🇸",
      spanish: "🇪🇸",
      french: "🇫🇷",
      german: "🇩🇪",
      italian: "🇮🇹",
      portuguese: "🇵🇹",
      russian: "🇷🇺",
      japanese: "🇯🇵",
      korean: "🇰🇷",
      chinese: "🇨🇳",
      arabic: "🇸🇦",
      hindi: "🇮🇳",
      turkish: "🇹🇷",
      dutch: "🇳🇱",
      polish: "🇵🇱",
      swedish: "🇸🇪",
      norwegian: "🇳🇴",
      danish: "🇩🇰",
      finnish: "🇫🇮",
      greek: "🇬🇷",
      hebrew: "🇮🇱",
      thai: "🇹🇭",
      vietnamese: "🇻🇳",
      unknown: "🌐",
    };
    return languageFlags[language.toLowerCase()] || "🌐";
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  if (transcriptions.length === 0) {
    return (
      <div className="rounded-lg bg-gray-50 p-8 text-center">
        <div className="mb-2 text-gray-400">
          <svg
            className="mx-auto h-12 w-12"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <title>Microphone Icon</title>
            <path
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
            />
          </svg>
        </div>
        <p className="text-gray-500">
          Start recording to see transcriptions appear here
        </p>
        <p className="mt-2 text-gray-400 text-sm">
          The system will automatically detect the language being spoken
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white">
      <div className="rounded-t-lg border-b bg-gray-50 px-4 py-2">
        <h3 className="font-medium text-gray-900">Live Transcriptions</h3>
        <p className="text-gray-500 text-sm">
          {transcriptions.length} recording(s)
        </p>
      </div>

      <div className="h-96 space-y-4 overflow-y-auto p-4" ref={containerRef}>
        {transcriptions.map((transcription) => (
          <div
            className="rounded-lg border-blue-500 border-l-4 bg-gray-50 p-4"
            key={transcription.id}
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-lg">
                  {getLanguageFlag(transcription.language)}
                </span>
                <span className="font-medium text-gray-700 text-sm capitalize">
                  {transcription.language}
                </span>
              </div>
              <span className="text-gray-500 text-xs">
                {formatTime(transcription.timestamp)}
              </span>
            </div>
            <p className="text-gray-900 leading-relaxed">
              {transcription.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
