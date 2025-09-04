import type {
	StreamingConfig,
	TranscriptionResult,
	WhisperInitOptions,
	WhisperInstance,
	WhisperModule,
} from "../types/whisper";

class WhisperWasmService {
	private instance: WhisperInstance | null = null;
	private audioContext: AudioContext | null = null;
	private workletNode: AudioWorkletNode | null = null;
	private isStreaming = false;

	private readonly defaultConfig: StreamingConfig = {
		sampleRate: 16000,
		channels: 1,
		chunkDuration: 3000, // 3 seconds
		modelSize: "tiny",
		language: "auto",
		translate: false,
	};

	// Model URLs from whisper.cpp repository on Hugging Face
	private readonly modelUrls = {
		tiny: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
		base: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
		small:
			"https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin",
		medium:
			"https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin",
		large:
			"https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin",
	};

	// Model sizes in MB for user information
	private readonly modelSizes = {
		tiny: 75,
		base: 142,
		small: 244,
		medium: 769,
		large: 1550,
	};

	/**
	 * Initialize the Whisper WASM module
	 */
	async initialize(
		config: Partial<StreamingConfig> = {},
		onProgress?: (progress: number) => void,
	): Promise<void> {
		const finalConfig = { ...this.defaultConfig, ...config };

		try {
			// Load the WASM module
			const module = await this.loadWasmModule();

			// Download and store the model using the working helper pattern
			const modelFilename = "whisper.bin";
			await this.loadAndStoreModel(
				finalConfig.modelSize,
				modelFilename,
				onProgress,
			);

			// Initialize with model
			const language =
				finalConfig.language === "auto" ? "en" : finalConfig.language || "en";
			const instance = module.init(modelFilename, language);

			if (!instance) {
				throw new Error("Failed to initialize Whisper instance");
			}

			this.instance = {
				module,
				instance,
				isInitialized: true,
				modelPath: modelFilename,
			};

			console.log("Whisper WASM initialized successfully, instance:", instance);
		} catch (error) {
			console.error("Failed to initialize Whisper WASM:", error);
			throw error;
		}
	}

	/**
	 * Load the WASM module
	 */
	private async loadWasmModule(): Promise<WhisperModule> {
		return new Promise((resolve, reject) => {
			// Setup Module configuration before loading the script
			const initOptions: WhisperInitOptions = {
				onRuntimeInitialized: () => {
					console.log("WASM Runtime initialized");
					// Wait a bit for the module to be fully ready
					setTimeout(() => {
						const module = window.Module as WhisperModule;
						if (!module.FS_createDataFile) {
							reject(
								new Error("WASM module does not have file system capabilities"),
							);
							return;
						}
						resolve(module);
					}, 100);
				},
				print: (text: string) => console.log("[Whisper]", text),
				printErr: (text: string) => console.error("[Whisper]", text),
			};

			// Set up the Module object before loading the script
			window.Module = initOptions as unknown as WhisperModule;

			// Set up global variables needed by helpers.js
			if (!window.dbVersion) {
				window.dbVersion = 1;
			}
			if (!window.dbName) {
				window.dbName = "whisper.ggerganov.com";
			}
			// indexedDB is already available on window, don't override it

			// Set up printTextarea function used by helpers.js
			if (!window.printTextarea) {
				window.printTextarea = (text: string) => {
					console.log("[Whisper WASM]", text);
				};
			}

			// Load helpers first
			const helpersScript = document.createElement("script");
			helpersScript.src = "/wasm/stream.wasm/helpers.js";
			helpersScript.onload = () => {
				console.log("Helpers script loaded");

				// Then load the stream.js which contains the WASM
				const streamScript = document.createElement("script");
				streamScript.src = "/wasm/stream.wasm/stream.js";
				streamScript.onload = () => {
					console.log("Stream script loaded");
				};
				streamScript.onerror = () =>
					reject(new Error("Failed to load stream.js"));
				document.head.appendChild(streamScript);
			};
			helpersScript.onerror = () =>
				reject(new Error("Failed to load helpers.js"));
			document.head.appendChild(helpersScript);
		});
	}

	/**
	 * Start streaming transcription
	 */
	async startStreaming(
		onTranscription: (result: TranscriptionResult) => void,
		onError: (error: string) => void,
	): Promise<void> {
		if (!this.instance?.isInitialized) {
			throw new Error("Whisper WASM not initialized");
		}

		if (this.isStreaming) {
			throw new Error("Already streaming");
		}

		try {
			// Initialize audio context
			this.audioContext = new AudioContext({ sampleRate: 16000 });

			// Get microphone access
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					sampleRate: 16000,
					channelCount: 1,
					echoCancellation: true,
					noiseSuppression: true,
				},
			});

			// Create audio processing worklet
			await this.setupAudioProcessing(stream, onTranscription, onError);

			this.isStreaming = true;
			console.log("Started streaming transcription");
		} catch (error) {
			console.error("Failed to start streaming:", error);
			onError(
				`Failed to start streaming: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	/**
	 * Set up audio processing pipeline
	 */
	private async setupAudioProcessing(
		stream: MediaStream,
		onTranscription: (result: TranscriptionResult) => void,
		onError: (error: string) => void,
	): Promise<void> {
		if (!this.audioContext || !this.instance) return;

		const source = this.audioContext.createMediaStreamSource(stream);
		const processor = this.audioContext.createScriptProcessor(4096, 1, 1);

		let audioBuffer: Float32Array[] = [];
		let bufferDuration = 0;
		const targetDuration = this.defaultConfig.chunkDuration / 1000; // Convert to seconds

		processor.onaudioprocess = (event) => {
			const inputData = event.inputBuffer.getChannelData(0);
			audioBuffer.push(new Float32Array(inputData));

			if (this.audioContext) {
				bufferDuration += inputData.length / this.audioContext.sampleRate;
			}

			// Process when we have enough audio data
			if (bufferDuration >= targetDuration) {
				this.processAudioChunk(audioBuffer, onTranscription, onError);
				audioBuffer = [];
				bufferDuration = 0;
			}
		};

		source.connect(processor);
		processor.connect(this.audioContext.destination);
	}

	/**
	 * Process a chunk of audio data
	 */
	private processAudioChunk(
		audioChunks: Float32Array[],
		onTranscription: (result: TranscriptionResult) => void,
		onError: (error: string) => void,
	): void {
		if (!this.instance?.module || !this.instance?.instance) return;

		try {
			// Combine audio chunks into single array
			const totalLength = audioChunks.reduce(
				(sum, chunk) => sum + chunk.length,
				0,
			);
			const combinedAudio = new Float32Array(totalLength);
			let offset = 0;

			for (const chunk of audioChunks) {
				combinedAudio.set(chunk, offset);
				offset += chunk.length;
			}

			// Feed audio to Whisper instance
			this.instance.module.set_audio(this.instance.instance, combinedAudio);

			// Get transcription result
			const text = this.extractTranscriptionText();
			const trimmedText = text?.trim();
			if (trimmedText) {
				onTranscription({
					text: trimmedText,
					language: "auto",
				});
			}
		} catch (error) {
			console.error("Error processing audio chunk:", error);
			onError("Error processing audio");
		}
	}

	/**
	 * Load and store model using the working helper pattern
	 */
	private async loadAndStoreModel(
		modelSize: string,
		filename: string,
		onProgress?: (progress: number) => void,
	): Promise<void> {
		const modelUrl = this.modelUrls[modelSize as keyof typeof this.modelUrls];
		const modelSizeMB =
			this.modelSizes[modelSize as keyof typeof this.modelSizes];

		if (!modelUrl) {
			throw new Error(`Model size '${modelSize}' not supported`);
		}

		console.log(`Loading model: ${modelSize} (~${modelSizeMB}MB)`);

		return new Promise((resolve, reject) => {
			// Define progress callback
			const cbProgress = (progress: number) => {
				onProgress?.(Math.round(progress * 100));
			};

			// Define success callback (storeFS function equivalent)
			const cbReady = (_dst: string, data: Uint8Array) => {
				try {
					// Use the global Module's FS functions
					const module = window.Module as WhisperModule;

					// Delete existing file if it exists
					try {
						module.FS_unlink(filename);
					} catch {
						// File doesn't exist, ignore error
					}

					// Create file in WASM file system
					module.FS_createDataFile("/", filename, data, true, true);

					console.log(
						`Stored model in WASM FS: ${filename} (${data.length} bytes)`,
					);
					resolve();
				} catch (error) {
					reject(new Error(`Failed to store model: ${error}`));
				}
			};

			// Define cancel callback
			const cbCancel = () => {
				reject(new Error("Model download was cancelled"));
			};

			// Define print callback
			const cbPrint = (text: string) => {
				console.log("[Model Loading]", text);
			};

			// Use the loadRemote function from helpers.js
			window.loadRemote(
				modelUrl,
				filename,
				modelSizeMB,
				cbProgress,
				cbReady,
				cbCancel,
				cbPrint,
			);
		});
	}

	/**
	 * Extract transcription text from WASM module
	 */
	private extractTranscriptionText(): string {
		if (!this.instance?.module) {
			return "";
		}

		try {
			const transcribed = this.instance.module.get_transcribed();
			return transcribed || "";
		} catch (error) {
			console.error("Error extracting transcription:", error);
			return "";
		}
	}

	/**
	 * Stop streaming transcription
	 */
	stopStreaming(): void {
		this.isStreaming = false;

		if (this.workletNode) {
			this.workletNode.disconnect();
			this.workletNode = null;
		}

		if (this.audioContext) {
			this.audioContext.close();
			this.audioContext = null;
		}

		console.log("Stopped streaming transcription");
	}

	/**
	 * Process a single audio file (non-streaming)
	 */
	async transcribeFile(audioFile: File): Promise<TranscriptionResult> {
		if (!this.instance?.isInitialized) {
			throw new Error("Whisper WASM not initialized");
		}

		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = async (event) => {
				try {
					const arrayBuffer = event.target?.result as ArrayBuffer;
					const audioData = new Float32Array(arrayBuffer);

					if (!this.instance) {
						reject(new Error("Instance not available"));
						return;
					}

					// Feed audio to Whisper instance
					this.instance.module.set_audio(this.instance.instance, audioData);

					// Get transcription result
					const text = this.extractTranscriptionText();
					resolve({
						text: text.trim(),
						language: "auto",
					});
				} catch (error) {
					reject(error);
				}
			};
			reader.readAsArrayBuffer(audioFile);
		});
	}

	/**
	 * Check if the service is initialized
	 */
	isInitialized(): boolean {
		return this.instance?.isInitialized ?? false;
	}

	/**
	 * Get model size in MB for a given model type
	 */
	getModelSize(modelSize: string): number {
		return this.modelSizes[modelSize as keyof typeof this.modelSizes] || 0;
	}

	/**
	 * Get available model sizes
	 */
	getAvailableModels(): Array<{ size: string; sizeMB: number }> {
		return Object.entries(this.modelSizes).map(([size, sizeMB]) => ({
			size,
			sizeMB,
		}));
	}

	/**
	 * Clean up resources
	 */
	dispose(): void {
		this.stopStreaming();

		if (this.instance) {
			// Set status to indicate cleanup
			if (this.instance.module) {
				this.instance.module.set_status("disposed");
			}
			this.instance = null;
		}
	}
}

export const whisperWasm = new WhisperWasmService();
export default whisperWasm;
