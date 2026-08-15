// Where things are, and how far apart.
//
// The maths is the web app's, unchanged. The two platform-bound parts are not:
// the geocode cache lives in AsyncStorage rather than localStorage, and the
// device fix comes from expo-location rather than the browser.

export interface LatLng {
	lat: number;
	lng: number;
}

/** Great-circle distance in km. Ported verbatim from the web app's cluster.ts. */
export function haversineKm(a: LatLng, b: LatLng): number {
	const R = 6371;
	const dLat = ((b.lat - a.lat) * Math.PI) / 180;
	const dLng = ((b.lng - a.lng) * Math.PI) / 180;
	const la1 = (a.lat * Math.PI) / 180;
	const la2 = (b.lat * Math.PI) / 180;
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(h));
}
