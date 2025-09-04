import { useWhisper } from "@/hooks/whisper/useWhisper";
import { Button } from "./ui/button";

const ModelHandler = () => {
	const {
		recording,
		speaking,
		transcript,
		transcribing,
		pauseRecording,
		startRecording,
		stopRecording,
	} = useWhisper({
		streaming: true,
		timeSlice: 3_000,
		removeSilence: true,
		apiKey: import.meta.env.VITE_OPENAI_API_KEY,
	});
	return (
		<div>
			<p>Recording: {recording ? "recording" : "not recording"}</p>
			<p>Speaking: {speaking ? "speaking" : "not speaking"}</p>
			<p>
				Transcripting: {transcribing ? "transcribing" : "not transcribging"}
			</p>
			<p>Transcribed Text: {transcript.text}</p>
			<Button onClick={() => startRecording()}>Start</Button>
			<Button onClick={() => pauseRecording()}>Pause</Button>
			<Button onClick={() => stopRecording()}>Stop</Button>
		</div>
	);
};

export default ModelHandler;
