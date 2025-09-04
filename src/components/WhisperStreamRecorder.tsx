import { Loader2, Mic, MicOff, Download } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import whisperWasm from "../services/whisperWasm";
import type { TranscriptionResult, StreamingConfig } from "../types/whisper";

type WhisperStreamRecorderProps = {
  onTranscription: (text: string, language: string) => void;
  onError: (error: string) => void;
  config?: Partial<StreamingConfig>;
};

export function WhisperStreamRecorder({
  onTranscription,
  onError,
  config = {},
}: WhisperStreamRecorderProps) {
  const [isInitializing, setIsInitializing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [modelDownloadProgress, setModelDownloadProgress] = useState(0);
  const initializeOnceRef = useRef(false);

  const initializeWasm = useCallback(async () => {
    if (whisperWasm.isInitialized()) {
      setIsInitialized(true);
      return;
    }

    setIsInitializing(true);
    setModelDownloadProgress(0);

    try {
      const modelSize = config.modelSize || 'tiny';
      const modelSizeMB = whisperWasm.getModelSize(modelSize);
      
      console.log(`Initializing Whisper with ${modelSize} model (~${modelSizeMB}MB)`);

      await whisperWasm.initialize(config, (progress) => {
        setModelDownloadProgress(progress);
      });
      
      setModelDownloadProgress(100);
      setIsInitialized(true);
      
      console.log('Whisper WASM initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Whisper WASM:', error);
      onError(`Failed to initialize Whisper: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsInitializing(false);
    }
  }, [config, onError]);

  // Initialize WASM service on component mount
  useEffect(() => {
    if (!initializeOnceRef.current) {
      initializeOnceRef.current = true;
      initializeWasm();
    }

    // Cleanup on unmount
    return () => {
      if (isStreaming) {
        whisperWasm.stopStreaming();
      }
    };
  }, [isStreaming, initializeWasm]);

  const handleTranscription = useCallback((result: TranscriptionResult) => {
    if (result.text.trim()) {
      onTranscription(result.text, result.language || 'unknown');
    }
  }, [onTranscription]);

  const handleError = useCallback((error: string) => {
    setIsProcessing(false);
    setIsStreaming(false);
    onError(error);
  }, [onError]);

  const startStreaming = useCallback(async () => {
    if (!isInitialized) {
      onError('Whisper WASM is not initialized yet');
      return;
    }

    try {
      setIsProcessing(true);
      await whisperWasm.startStreaming(handleTranscription, handleError);
      setIsStreaming(true);
    } catch (error) {
      console.error('Failed to start streaming:', error);
      handleError(`Failed to start streaming: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  }, [isInitialized, handleTranscription, handleError, onError]);

  const stopStreaming = useCallback(() => {
    try {
      whisperWasm.stopStreaming();
      setIsStreaming(false);
      setIsProcessing(false);
    } catch (error) {
      console.error('Failed to stop streaming:', error);
      handleError('Failed to stop streaming');
    }
  }, [handleError]);

  const toggleStreaming = useCallback(() => {
    if (isStreaming) {
      stopStreaming();
    } else {
      startStreaming();
    }
  }, [isStreaming, startStreaming, stopStreaming]);

  const getButtonText = useCallback(() => {
    const modelSize = config.modelSize || 'tiny';
    const modelSizeMB = whisperWasm.getModelSize(modelSize);
    
    if (isInitializing) {
      return modelDownloadProgress > 0 
        ? `Downloading ${modelSize} model... ${modelDownloadProgress}%`
        : 'Initializing Whisper...';
    }
    if (isProcessing) {
      return 'Starting...';
    }
    if (isStreaming) {
      return 'Recording... Click to stop';
    }
    if (!isInitialized) {
      return `Click to download ${modelSize} model (${modelSizeMB}MB)`;
    }
    return 'Click to start recording';
  }, [isInitializing, isProcessing, isStreaming, isInitialized, modelDownloadProgress, config.modelSize]);

  const getStatusText = useCallback(() => {
    const modelSize = config.modelSize || 'tiny';
    
    if (isInitializing) {
      return modelDownloadProgress > 0 
        ? 'Downloading AI model from Hugging Face...' 
        : 'Setting up local AI transcription...';
    }
    if (isProcessing) {
      return 'Processing audio...';
    }
    if (isStreaming) {
      return 'Streaming transcription active';
    }
    if (!isInitialized) {
      return `Ready to download ${modelSize} model for offline AI`;
    }
    return 'Local AI ready - works completely offline';
  }, [isInitializing, isProcessing, isStreaming, isInitialized, modelDownloadProgress, config.modelSize]);

  const isDisabled = isInitializing || isProcessing || (!isInitialized && !isStreaming);

  return (
    <div className="flex flex-col items-center space-y-4">
      <Button
        className={`relative h-16 w-16 rounded-full transition-colors duration-200 ${
          isStreaming
            ? "bg-red-500 hover:bg-red-600"
            : isInitialized
            ? "bg-green-500 hover:bg-green-600"
            : "bg-blue-500 hover:bg-blue-600"
        }`}
        disabled={isDisabled}
        onClick={isInitialized ? toggleStreaming : initializeWasm}
        size="lg"
      >
        {(() => {
          if (isInitializing || isProcessing) {
            return <Loader2 className="h-6 w-6 animate-spin text-white" />;
          }
          if (isStreaming) {
            return <MicOff className="h-6 w-6 text-white" />;
          }
          if (!isInitialized) {
            return <Download className="h-6 w-6 text-white" />;
          }
          return <Mic className="h-6 w-6 text-white" />;
        })()}
      </Button>

      <div className="text-center">
        <p className="text-gray-600 text-sm">{getButtonText()}</p>
        <p className="mt-1 text-xs text-gray-500">{getStatusText()}</p>
        {isStreaming && <p className="mt-1 text-red-500 text-xs">🔴 Live Transcription</p>}
        {isInitializing && modelDownloadProgress > 0 && (
          <div className="mt-2 w-48 bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
              style={{ width: `${modelDownloadProgress}%` }}
            />
          </div>
        )}
      </div>

      {isInitialized && (
        <div className="text-center">
          <p className="text-green-600 text-xs">✅ Local AI Model Loaded</p>
          <p className="text-gray-500 text-xs">Works offline - no data sent to servers</p>
        </div>
      )}
    </div>
  );
}
