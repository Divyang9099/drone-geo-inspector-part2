let _promise: Promise<void> | null = null

export function loadGoogleMaps(apiKey: string): Promise<void> {
    if (_promise) return _promise

    // Already available (e.g. hot-reload)
    if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>)['google']) {
        _promise = Promise.resolve()
        return _promise
    }

    _promise = new Promise<void>((resolve, reject) => {
        const callbackName = '__googleMapsReady'
        const w = window as unknown as Record<string, unknown>

        w[callbackName] = () => {
            resolve()
            delete w[callbackName]
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
            _promise = null
            reject(new Error('Google Maps JS API failed to load'))
        }
        document.head.appendChild(script)
    })

    return _promise
}
