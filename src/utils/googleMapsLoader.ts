// Loads the Google Maps JavaScript API (with Places library) exactly once.
// All callers share the same Promise so the script is injected only once
// regardless of how many components call this concurrently.

let _promise: Promise<void> | null = null

export function loadGoogleMaps(apiKey: string): Promise<void> {
    if (_promise) return _promise

    // Already available (e.g. hot-reload)
    if (typeof window !== 'undefined' && window.google?.maps?.places) {
        _promise = Promise.resolve()
        return _promise
    }

    _promise = new Promise<void>((resolve, reject) => {
        const callbackName = '__googleMapsReady'

        ;(window as Window & { [k: string]: unknown })[callbackName] = () => {
            resolve()
            delete (window as Window & { [k: string]: unknown })[callbackName]
        }

        const script = document.createElement('script')
        script.src =
            `https://maps.googleapis.com/maps/api/js` +
            `?key=${encodeURIComponent(apiKey)}` +
            `&libraries=places` +
            `&callback=${callbackName}` +
            `&loading=async`
        script.async = true
        script.defer = true
        script.onerror = () => {
            _promise = null  // allow retry
            reject(new Error('Google Maps JS API failed to load'))
        }
        document.head.appendChild(script)
    })

    return _promise
}
