// TypeScript types for Whisper.cpp WASM module

export type WhisperInstanceHandle = number;

export interface WhisperModule {
	// Core whisper.cpp WASM API functions (based on actual implementation)
	init: (modelPath: string, language: string) => WhisperInstanceHandle | null;
	set_audio: (instance: WhisperInstanceHandle, audioData: Float32Array) => void;
	get_transcribed: () => string | null;
	get_status: () => string;
	set_status: (status: string) => void;

	// File system functions
	FS_createDataFile: (
		path: string,
		filename: string,
		data: Uint8Array,
		readable: boolean,
		writable: boolean,
	) => void;
	FS_unlink: (filename: string) => void;

	// Memory management (Emscripten standard)
	_malloc?: (size: number) => number;
	_free?: (ptr: number) => void;
	HEAP8?: Int8Array;
	HEAP16?: Int16Array;
	HEAP32?: Int32Array;
	HEAPU8?: Uint8Array;
	HEAPU16?: Uint16Array;
	HEAPU32?: Uint32Array;
	HEAPF32?: Float32Array;
	HEAPF64?: Float64Array;
}

export interface WhisperInitOptions {
	locateFile?: (path: string, scriptDirectory: string) => string;
	onRuntimeInitialized?: () => void;
	print?: (text: string) => void;
	printErr?: (text: string) => void;
}

export interface WhisperInstance {
	module: WhisperModule;
	instance: WhisperInstanceHandle;
	isInitialized: boolean;
	modelPath: string;
}

export interface TranscriptionResult {
	text: string;
	language?: string;
	confidence?: number;
	segments?: TranscriptionSegment[];
}

export interface TranscriptionSegment {
	start: number;
	end: number;
	text: string;
	confidence?: number;
}

export interface StreamingConfig {
	sampleRate: number;
	channels: number;
	chunkDuration: number; // in milliseconds
	modelSize: "tiny" | "base" | "small" | "medium" | "large";
	language?: string;
	translate?: boolean;
}

declare global {
	interface Window {
		Module: WhisperModule;
		// Helper functions from helpers.js
		loadRemote: (
			url: string,
			dst: string,
			sizeMB: number,
			cbProgress: (progress: number) => void,
			cbReady: (dst: string, data: Uint8Array) => void,
			cbCancel: () => void,
			cbPrint: (text: string) => void,
		) => void;
		// Global variables needed by helpers.js
		dbVersion: number;
		dbName: string;
		printTextarea: (text: string) => void;
	}
}
