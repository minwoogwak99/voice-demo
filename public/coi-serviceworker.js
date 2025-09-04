// Cross-Origin Isolation Service Worker
// This service worker enables SharedArrayBuffer by setting the required headers

if (typeof window === "undefined") {
	// This is a service worker
	self.addEventListener("install", (event) => {
		console.log("COI Service Worker installing");
		self.skipWaiting();
	});

	self.addEventListener("activate", (event) => {
		console.log("COI Service Worker activating");
		event.waitUntil(self.clients.claim());
	});

	self.addEventListener("fetch", (event) => {
		if (
			event.request.cache === "only-if-cached" &&
			event.request.mode !== "same-origin"
		) {
			return;
		}

		event.respondWith(
			fetch(event.request).then((response) => {
				if (response.status === 0) {
					return response;
				}

				const newHeaders = new Headers(response.headers);
				newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
				newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");

				return new Response(response.body, {
					status: response.status,
					statusText: response.statusText,
					headers: newHeaders,
				});
			}),
		);
	});
} else {
	// This is the main thread - register the service worker
	if ("serviceWorker" in navigator) {
		window.addEventListener("load", () => {
			navigator.serviceWorker
				.register("/coi-serviceworker.js")
				.then((registration) => {
					console.log(
						"COI Service Worker registered with scope: ",
						registration.scope,
					);
				})
				.catch((error) => {
					console.log("COI Service Worker registration failed: ", error);
				});
		});
	}
}
