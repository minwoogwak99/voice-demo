import { AlertCircle, Mic } from "lucide-react";
import { useCallback, useState } from "react";
import { AudioRecorder } from "./components/AudioRecorder";
import { TranscriptionDisplay } from "./components/TranscriptionDisplay";

type Transcription = {
  id: string;
  text: string;
  language: string;
  timestamp: Date;
};

function App() {
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleTranscription = useCallback((text: string, language: string) => {
    const newTranscription: Transcription = {
      id: Date.now().toString(),
      text,
      language,
      timestamp: new Date(),
    };

    setTranscriptions((prev) => [...prev, newTranscription]);
    setError(null); // Clear any previous errors
  }, []);

  const handleError = useCallback((errorMessage: string) => {
    setError(errorMessage);
  }, []);

  const clearTranscriptions = () => {
    setTranscriptions([]);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-4 flex items-center justify-center">
            <Mic className="mr-2 h-8 w-8 text-blue-600" />
            <h1 className="font-bold text-4xl text-gray-900">
              Voice Transcriber
            </h1>
          </div>
          <p className="mx-auto max-w-2xl text-gray-600 text-lg">
            Real-time audio transcription with automatic language detection
            powered by OpenAI Whisper
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mx-auto mb-6 max-w-2xl">
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="flex items-center">
                <AlertCircle className="mr-2 h-5 w-5 text-red-500" />
                <span className="text-red-700">{error}</span>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="mx-auto max-w-4xl">
          <div className="grid gap-8 lg:grid-cols-2">
            {/* Recording Section */}
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <h2 className="mb-6 text-center font-semibold text-gray-900 text-xl">
                Audio Recording
              </h2>
              <AudioRecorder
                onError={handleError}
                onTranscription={handleTranscription}
              />

              {/* Controls */}
              <div className="mt-6 border-t pt-6">
                <button
                  className="w-full rounded-md border border-gray-300 bg-gray-100 px-4 py-2 font-medium text-gray-700 text-sm transition-colors hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                  disabled={transcriptions.length === 0}
                  onClick={clearTranscriptions}
                  type="button"
                >
                  Clear All Transcriptions
                </button>
              </div>
            </div>

            {/* Transcription Display */}
            <div>
              <TranscriptionDisplay transcriptions={transcriptions} />
            </div>
          </div>
        </div>

        {/* Info Section */}
        <div className="mx-auto mt-8 max-w-4xl">
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h3 className="mb-4 font-semibold text-gray-900 text-lg">
              How It Works
            </h3>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                  <span className="text-2xl">🎤</span>
                </div>
                <h4 className="mb-2 font-medium text-gray-900">Record Audio</h4>
                <p className="text-gray-600 text-sm">
                  Click the microphone button to start recording your voice
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                  <span className="text-2xl">🤖</span>
                </div>
                <h4 className="mb-2 font-medium text-gray-900">
                  AI Processing
                </h4>
                <p className="text-gray-600 text-sm">
                  OpenAI Whisper automatically detects language and transcribes
                  speech
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-purple-100">
                  <span className="text-2xl">📝</span>
                </div>
                <h4 className="mb-2 font-medium text-gray-900">Live Results</h4>
                <p className="text-gray-600 text-sm">
                  See real-time transcriptions with language identification
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
