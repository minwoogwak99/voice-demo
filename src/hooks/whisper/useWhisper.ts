import { useEffectAsync, useMemoAsync } from "@chengsokdara/react-hooks-async";
import { useMicVAD } from "@ricky0123/vad-react";
import OpenAI from "openai";
import { useEffect, useRef, useState } from "react";
import type { Options, RecordRTCPromisesHandler } from "recordrtc";
import {
	defaultStopTimeout,
	ffmpegCoreUrl,
	silenceRemoveCommand,
} from "./configs";
import type {
	UseWhisperConfig,
	UseWhisperHook,
	UseWhisperTimeout,
	UseWhisperTranscript,
} from "./types";

/**
 * default useWhisper configuration
 */
const defaultConfig: UseWhisperConfig = {
	apiKey: "",
	autoStart: false,
	autoTranscribe: true,
	mode: "transcriptions",
	nonStop: false,
	removeSilence: false,
	stopTimeout: defaultStopTimeout,
	streaming: false,
	timeSlice: 1_000,
	onDataAvailable: undefined,
	onTranscribe: undefined,
};

/**
 * default timeout for recorder
 */
const defaultTimeout: UseWhisperTimeout = {
	stop: undefined,
};

/**
 * default transcript object
 */
const defaultTranscript: UseWhisperTranscript = {
	blob: undefined,
	text: undefined,
};

/**
 * Helper function to merge WAV audio chunks properly
 * Each chunk is a complete WAV file with headers, so we need to extract
 * the raw audio data and create a new WAV file with proper headers
 */
const mergeWavChunks = async (chunks: Blob[]): Promise<Blob> => {
	// If there's only one chunk, return it as is
	if (chunks.length === 1) {
		return chunks[0];
	}

	const audioBuffers: ArrayBuffer[] = [];
	let sampleRate = 44100; // Default sample rate
	let numChannels = 1; // Mono by default
	let bitsPerSample = 16; // 16-bit audio by default

	// Process each chunk to extract raw audio data
	for (const chunk of chunks) {
		const arrayBuffer = await chunk.arrayBuffer();
		const dataView = new DataView(arrayBuffer);

		// Skip WAV header (44 bytes) and extract raw audio data
		// WAV header structure:
		// 0-3: "RIFF"
		// 4-7: File size
		// 8-11: "WAVE"
		// 12-15: "fmt "
		// 16-19: fmt chunk size
		// 20-21: Audio format
		// 22-23: Number of channels
		// 24-27: Sample rate
		// 28-31: Byte rate
		// 32-33: Block align
		// 34-35: Bits per sample
		// 36-39: "data"
		// 40-43: Data size
		// 44+: Raw audio data

		// Extract audio format info from first chunk
		if (audioBuffers.length === 0) {
			numChannels = dataView.getUint16(22, true);
			sampleRate = dataView.getUint32(24, true);
			bitsPerSample = dataView.getUint16(34, true);
		}

		// Find the "data" chunk (in case there are extra chunks like "LIST")
		let dataOffset = 12; // Start after "RIFF" header
		while (dataOffset < arrayBuffer.byteLength - 8) {
			const chunkId = String.fromCharCode(
				dataView.getUint8(dataOffset),
				dataView.getUint8(dataOffset + 1),
				dataView.getUint8(dataOffset + 2),
				dataView.getUint8(dataOffset + 3),
			);
			const chunkSize = dataView.getUint32(dataOffset + 4, true);

			if (chunkId === "data") {
				// Found the data chunk, extract raw audio
				const audioData = arrayBuffer.slice(
					dataOffset + 8,
					dataOffset + 8 + chunkSize,
				);
				audioBuffers.push(audioData);
				break;
			}

			// Move to next chunk
			dataOffset += 8 + chunkSize;
		}
	}

	// Combine all raw audio data
	const totalLength = audioBuffers.reduce(
		(sum, buffer) => sum + buffer.byteLength,
		0,
	);
	const combinedAudio = new Uint8Array(totalLength);
	let offset = 0;
	for (const buffer of audioBuffers) {
		combinedAudio.set(new Uint8Array(buffer), offset);
		offset += buffer.byteLength;
	}

	// Create new WAV file with proper headers
	const wavHeader = new ArrayBuffer(44);
	const view = new DataView(wavHeader);

	// "RIFF" identifier
	view.setUint8(0, 0x52); // R
	view.setUint8(1, 0x49); // I
	view.setUint8(2, 0x46); // F
	view.setUint8(3, 0x46); // F

	// File size (excluding first 8 bytes)
	view.setUint32(4, 36 + combinedAudio.length, true);

	// "WAVE" identifier
	view.setUint8(8, 0x57); // W
	view.setUint8(9, 0x41); // A
	view.setUint8(10, 0x56); // V
	view.setUint8(11, 0x45); // E

	// "fmt " sub-chunk
	view.setUint8(12, 0x66); // f
	view.setUint8(13, 0x6d); // m
	view.setUint8(14, 0x74); // t
	view.setUint8(15, 0x20); // space

	// fmt chunk size (16 for PCM)
	view.setUint32(16, 16, true);

	// Audio format (1 = PCM)
	view.setUint16(20, 1, true);

	// Number of channels
	view.setUint16(22, numChannels, true);

	// Sample rate
	view.setUint32(24, sampleRate, true);

	// Byte rate (sample rate * channels * bits per sample / 8)
	view.setUint32(28, (sampleRate * numChannels * bitsPerSample) / 8, true);

	// Block align (channels * bits per sample / 8)
	view.setUint16(32, (numChannels * bitsPerSample) / 8, true);

	// Bits per sample
	view.setUint16(34, bitsPerSample, true);

	// "data" sub-chunk
	view.setUint8(36, 0x64); // d
	view.setUint8(37, 0x61); // a
	view.setUint8(38, 0x74); // t
	view.setUint8(39, 0x61); // a

	// Data size
	view.setUint32(40, combinedAudio.length, true);

	// Combine header with audio data
	const wavFile = new Uint8Array(44 + combinedAudio.length);
	wavFile.set(new Uint8Array(wavHeader), 0);
	wavFile.set(combinedAudio, 44);

	return new Blob([wavFile], { type: "audio/wav" });
};

/**
 * React Hook for OpenAI Whisper
 */
export const useWhisper: UseWhisperHook = (config) => {
	const {
		apiKey,
		autoStart,
		autoTranscribe,
		mode,
		nonStop,
		removeSilence,
		stopTimeout,
		streaming,
		timeSlice,
		whisperConfig,
		onDataAvailable: onDataAvailableCallback,
		onTranscribe: onTranscribeCallback,
	} = {
		...defaultConfig,
		...config,
	};

	if (!apiKey && !onTranscribeCallback) {
		throw new Error("apiKey is required if onTranscribe is not provided");
	}
	const openai = new OpenAI({
		apiKey: apiKey,
		dangerouslyAllowBrowser: true,
	});

	const chunks = useRef<Blob[]>([]);
	const speechChunks = useRef<Blob[]>([]);
	const isSpeaking = useRef<boolean>(false);
	const lastTranscriptionTime = useRef<number>(0);

	const recorder = useRef<RecordRTCPromisesHandler | undefined>(undefined);
	const stream = useRef<MediaStream | undefined>(undefined);
	const timeout = useRef<UseWhisperTimeout>(defaultTimeout);

	const [recording, setRecording] = useState<boolean>(false);
	const [speaking, setSpeaking] = useState<boolean>(false);
	const [transcribing, setTranscribing] = useState<boolean>(false);
	const [transcript, setTranscript] =
		useState<UseWhisperTranscript>(defaultTranscript);

	/**
	 * cleanup on component unmounted
	 * - flush out and cleanup lamejs encoder instance
	 * - destroy recordrtc instance and clear it from ref
	 * - clear setTimout for onStopRecording
	 * - stop all user's media steaming track and remove it from ref
	 */

	// biome-ignore lint/correctness/useExhaustiveDependencies: ""
	useEffect(() => {
		return () => {
			vad.pause(); // Stop VAD on cleanup
			if (chunks.current) {
				chunks.current = [];
			}
			if (speechChunks.current) {
				speechChunks.current = [];
			}
			if (recorder.current) {
				recorder.current.destroy();
				recorder.current = undefined;
			}
			onStopTimeout("stop");
			if (stream.current) {
				stream.current.getTracks().forEach((track) => {
					track.stop();
				});
				stream.current = undefined;
			}
		};
	}, []);

	/**
	 * if config.autoStart is true
	 * start speech recording immediately upon component mounted
	 */
	useEffectAsync(async () => {
		if (autoStart) {
			vad.start(); // Start VAD for speech detection
			await onStartRecording();
		}
	}, [autoStart]);

	/**
	 * start speech recording and start listen for speaking event
	 */
	const startRecording = async () => {
		vad.start(); // Start VAD for speech detection
		await onStartRecording();
	};

	/**
	 * pause speech recording also stop media stream
	 */
	const pauseRecording = async () => {
		vad.pause(); // Pause VAD speech detection
		await onPauseRecording();
	};

	/**
	 * stop speech recording and start the transcription
	 */
	const stopRecording = async () => {
		vad.pause(); // Stop VAD speech detection
		await onStopRecording();
	};

	/**
	 * start speech recording event
	 * - first ask user for media stream
	 * - create recordrtc instance and pass media stream to it
	 * - create lamejs encoder instance
	 * - check recorder state and start or resume recorder accordingly
	 * - start timeout for stop timeout config
	 * - update recording state to true
	 */
	const onStartRecording = async () => {
		try {
			if (!stream.current) {
				await onStartStreaming();
			}
			if (stream.current) {
				if (!recorder.current) {
					const {
						default: { RecordRTCPromisesHandler, StereoAudioRecorder },
					} = await import("recordrtc");
					const recorderConfig: Options = {
						mimeType: "audio/wav",
						numberOfAudioChannels: 1, // mono
						recorderType: StereoAudioRecorder,
						sampleRate: 44100, // Sample rate = 44.1khz
						timeSlice: streaming ? timeSlice : undefined,
						type: "audio",
						ondataavailable:
							autoTranscribe && streaming ? onDataAvailable : undefined,
					};
					recorder.current = new RecordRTCPromisesHandler(
						stream.current,
						recorderConfig,
					);
				}
				const recordState = await recorder.current.getState();
				if (recordState === "inactive" || recordState === "stopped") {
					await recorder.current.startRecording();
				}
				if (recordState === "paused") {
					await recorder.current.resumeRecording();
				}
				if (nonStop) {
					onStartTimeout("stop");
				}
				setRecording(true);
			}
		} catch (err) {
			console.error(err);
		}
	};

	/**
	 * get user media stream event
	 * - try to stop all previous media streams
	 * - ask user for media stream with a system popup
	 */
	const onStartStreaming = async () => {
		try {
			if (stream.current) {
				stream.current.getTracks().forEach((track) => {
					track.stop();
				});
			}
			stream.current = await navigator.mediaDevices.getUserMedia({
				audio: true,
			});
		} catch (err) {
			console.error(err);
		}
	};

	/**
	 * start stop timeout event
	 */
	const onStartTimeout = (type: keyof UseWhisperTimeout) => {
		if (!timeout.current[type]) {
			timeout.current[type] = setTimeout(onStopRecording, stopTimeout);
		}
	};

	/**
	 * user start speaking event
	 * - set speaking state to true
	 * - clear stop timeout
	 */
	const onStartSpeaking = () => {
		console.log("start speaking");
		setSpeaking(true);
		isSpeaking.current = true;
		onStopTimeout("stop");
	};

	/**
	 * user stop speaking event
	 * - set speaking state to false
	 * - start stop timeout back
	 */
	const onStopSpeaking = async () => {
		console.log("stop speaking");
		setSpeaking(false);
		isSpeaking.current = false;
		
		// Process accumulated speech chunks when speech ends
		if (speechChunks.current.length > 0 && streaming) {
			try {
				const blob = await mergeWavChunks(speechChunks.current);
				const file = new File([blob], "speech.wav", {
					type: "audio/wav",
				});
				const text = await onWhispered(file);
				console.log("onSpeechEnd transcription", { text });
				if (text) {
					setTranscript((prev) => ({ ...prev, text }));
				}
				// Clear speech chunks after processing
				speechChunks.current = [];
			} catch (err) {
				console.error("Error processing speech chunks:", err);
			}
		}
		
		if (nonStop) {
			onStartTimeout("stop");
		}
	};

	/**
	 * VAD (Voice Activity Detection) hook for speaking detection
	 */
	const vad = useMicVAD({
		startOnLoad: false,
		onSpeechStart: onStartSpeaking,
		onSpeechEnd: onStopSpeaking,
	});

	/**
	 * pause speech recording event
	 * - if recorder state is recording, pause the recorder
	 * - clear stop timeout
	 * - set recoriding state to false
	 */
	const onPauseRecording = async () => {
		try {
			if (recorder.current) {
				const recordState = await recorder.current.getState();
				if (recordState === "recording") {
					await recorder.current.pauseRecording();
				}
				onStopTimeout("stop");
				setRecording(false);
			}
		} catch (err) {
			console.error(err);
		}
	};

	/**
	 * stop speech recording event
	 * - flush out lamejs encoder and set it to undefined
	 * - if recorder state is recording or paused, stop the recorder
	 * - stop user media stream
	 * - clear stop timeout
	 * - set recording state to false
	 * - start Whisper transcription event
	 * - destroy recordrtc instance and clear it from ref
	 */
	const onStopRecording = async () => {
		try {
			if (recorder.current) {
				const recordState = await recorder.current.getState();
				if (recordState === "recording" || recordState === "paused") {
					await recorder.current.stopRecording();
				}
				onStopStreaming();
				onStopTimeout("stop");
				setRecording(false);
				if (autoTranscribe) {
					await onTranscribing();
				} else {
					const blob = await recorder.current.getBlob();
					setTranscript({
						blob,
					});
				}
				await recorder.current.destroy();
				chunks.current = [];
				speechChunks.current = [];
				recorder.current = undefined;
			}
		} catch (err) {
			console.error(err);
		}
	};

	/**
	 * stop media stream event
	 * - stop all media stream tracks
	 * - clear media stream from ref
	 */
	const onStopStreaming = () => {
		if (stream.current) {
			stream.current.getTracks().forEach((track) => {
				track.stop();
			});
			stream.current = undefined;
		}
	};

	/**
	 * stop timeout event
	 * - clear stop timeout and remove it from ref
	 */
	const onStopTimeout = (type: keyof UseWhisperTimeout) => {
		if (timeout.current[type]) {
			clearTimeout(timeout.current[type]);
			timeout.current[type] = undefined;
		}
	};

	/**
	 * start Whisper transcrition event
	 * - make sure recorder state is stopped
	 * - set transcribing state to true
	 * - get audio blob from recordrtc
	 * - if config.removeSilence is true, load ffmpeg-wasp and try to remove silence from speec
	 * - if config.customServer is true, send audio data to custom server in base64 string
	 * - if config.customServer is false, send audio data to Whisper api in multipart/form-data
	 * - set transcript object with audio blob and transcription result from Whisper
	 * - set transcribing state to false
	 */
	const onTranscribing = async () => {
		console.log("transcribing speech");
		try {
			if (recorder.current) {
				const recordState = await recorder.current.getState();
				if (recordState === "stopped") {
					setTranscribing(true);
					let blob = await recorder.current.getBlob();
					let outputMime = "audio/wav";
					let outputFilename = "speech.wav";
					if (removeSilence) {
						const { createFFmpeg } = await import("@ffmpeg/ffmpeg");
						const ffmpeg = createFFmpeg({
							mainName: "main",
							corePath: ffmpegCoreUrl,
							log: true,
						});
						if (!ffmpeg.isLoaded()) {
							await ffmpeg.load();
						}
						const buffer = await blob.arrayBuffer();
						console.log({ in: buffer.byteLength });
						ffmpeg.FS("writeFile", "in.wav", new Uint8Array(buffer));
						await ffmpeg.run(
							"-i", // Input
							"in.wav",
							"-acodec", // Audio codec
							"libmp3lame",
							"-b:a", // Audio bitrate
							"96k",
							"-ar", // Audio sample rate
							"44100",
							"-af", // Audio filter = remove silence from start to end with 2 seconds in between
							silenceRemoveCommand,
							"out.mp3", // Output
						);
						const out = ffmpeg.FS("readFile", "out.mp3");
						console.log({ out: out.buffer.byteLength });
						// 225 seems to be empty mp3 file
						if (out.length <= 225) {
							ffmpeg.exit();
							setTranscript({
								blob,
							});
							setTranscribing(false);
							return;
						}
						blob = new Blob([out.buffer], { type: "audio/mpeg" });
						outputMime = "audio/mpeg";
						outputFilename = "speech.mp3";
						ffmpeg.exit();
					}
					if (typeof onTranscribeCallback === "function") {
						const transcribed = await onTranscribeCallback(blob);
						console.log("onTranscribe", transcribed);
						setTranscript(transcribed);
					} else {
						const file = new File([blob], outputFilename, { type: outputMime });
						const text = await onWhispered(file);
						console.log("onTranscribing", { text });
						setTranscript({
							blob,
							text,
						});
					}
					setTranscribing(false);
				}
			}
		} catch (err) {
			console.info(err);
			setTranscribing(false);
		}
	};

	/**
	 * Get audio data in chunk based on timeSlice
	 * - while recording send audio chunk to Whisper only during speech
	 * - chunks are concatenated in succession during speech
	 * - set transcript text with interim result
	 */
	const onDataAvailable = async (data: Blob) => {
		console.log("onDataAvailable", { 
			dataSize: data.size, 
			isSpeaking: isSpeaking.current,
			speechChunksLength: speechChunks.current.length 
		});
		
		try {
			if (streaming && recorder.current) {
				onDataAvailableCallback?.(data);
				
				// Always keep all chunks for final processing
				chunks.current.push(data);
				
				// Only collect chunks for transcription when speaking
				if (isSpeaking.current) {
					console.log("Speech detected, adding chunk to speechChunks");
					speechChunks.current.push(data);
					
					// Optional: Transcribe in real-time during speech
					// You can control this frequency with lastTranscriptionTime
					const now = Date.now();
					const timeSinceLastTranscription = now - lastTranscriptionTime.current;
					
					// Transcribe every 2 seconds during continuous speech
					if (timeSinceLastTranscription > 2000 && speechChunks.current.length > 0) {
						const recorderState = await recorder.current.getState();
						if (recorderState === "recording") {
							const blob = await mergeWavChunks(speechChunks.current);
							const file = new File([blob], "speech.wav", {
								type: "audio/wav",
							});
							const text = await onWhispered(file);
							console.log("onInterimTranscription", { text });
							if (text) {
								setTranscript((prev) => ({ ...prev, text }));
							}
							lastTranscriptionTime.current = now;
						}
					}
				} else {
					console.log("No speech detected, skipping chunk for transcription");
				}
			}
		} catch (err) {
			console.error("Error in onDataAvailable:", err);
		}
	};

	/**
	 * Send audio file to Whisper to be transcribed
	 * - create formdata and append file, model, and language
	 * - append more Whisper config if whisperConfig is provided
	 * - add OpenAPI Token to header Authorization Bearer
	 * - post with axios to OpenAI Whisper transcript endpoint
	 * - return transcribed text result
	 */
	const onWhispered = useMemoAsync(
		async (file: File) => {
			const response = await openai.audio.transcriptions.create({
				file: file,
				model: "whisper-1",
				response_format: whisperConfig?.response_format,
				temperature: whisperConfig?.temperature,
				prompt: whisperConfig?.prompt,
			});
			return response.text;
		},
		[apiKey, mode, whisperConfig],
	);

	return {
		recording,
		speaking,
		transcribing,
		transcript,
		pauseRecording,
		startRecording,
		stopRecording,
	};
};
