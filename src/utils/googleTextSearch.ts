const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined

export interface PlaceResult {
    id: string
    placeId: string
    lat: number
    lon: number
    primaryName: string
    context: string
    types: string[]
    source: 'google'
}

export async function textSearch(query: string, signal: AbortSignal): Promise<PlaceResult[]> {
    if (!GOOGLE_KEY) {
        console.warn('[textSearch] VITE_GOOGLE_MAPS_KEY is not set — check .env.local')
        return []
    }

    console.log('[textSearch] calling Places API (New) for:', query)

    let res: Response
    try {
        res = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            signal,
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': GOOGLE_KEY,
                'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.types',
            },
            body: JSON.stringify({
                textQuery: query,
                maxResultCount: 10,
                languageCode: 'en',
            }),
        })
    } catch (err) {
        console.error('[textSearch] fetch failed:', err)
        return []
    }

    const data = await res.json()

    if (!res.ok) {
        console.error('[textSearch] API error', res.status, data?.error?.message ?? data)
        return []
    }

    console.log('[textSearch] got', data?.places?.length ?? 0, 'results')

    return (data.places ?? [])
        .map((place: any, i: number) => ({
            id: `g-${place.id ?? i}`,
            placeId: place.id ?? '',
            primaryName: place.displayName?.text ?? 'Unknown',
            context: place.formattedAddress ?? '',
            types: place.types ?? [],
            lat: place.location?.latitude,
            lon: place.location?.longitude,
            source: 'google' as const,
        }))
        .filter((p: PlaceResult) => p.lat != null && p.lon != null)
}
