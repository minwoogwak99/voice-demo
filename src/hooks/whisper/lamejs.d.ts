declare module "lamejs" {
	export type Encoder = {
		encodeBuffer: (left: Int16Array, right?: Int16Array) => Int8Array;
		flush: () => Int8Array;
	};
	export const Mp3Encoder: {
		new (channels: 1 | 2, samplerate: number, kbps: number): Encoder;
	};
}
