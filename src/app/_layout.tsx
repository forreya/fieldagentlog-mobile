import { Archivo_400Regular, Archivo_600SemiBold, Archivo_700Bold, Archivo_800ExtraBold, useFonts } from "@expo-google-fonts/archivo";
import { IBMPlexMono_500Medium } from "@expo-google-fonts/ibm-plex-mono";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";

import { AuthProvider } from "@/auth/AuthProvider";
import { bootstrap } from "@/bootstrap";

SplashScreen.preventAutoHideAsync();

/**
 * Fonts are BUNDLED (not fetched), because the app has to open in a basement.
 * The splash stays up until they are ready so no screen ever flashes in the
 * fallback face.
 */
export default function RootLayout() {
	const [ready, error] = useFonts({
		Archivo_400Regular,
		Archivo_600SemiBold,
		Archivo_700Bold,
		Archivo_800ExtraBold,
		IBMPlexMono_500Medium,
	});

	// Storage, the sync queues and their triggers. Deliberately not awaited: the
	// first screen must not wait on a database open, and anything queued is
	// already on disk and will go on the next pass either way.
	useEffect(() => {
		void bootstrap();
	}, []);

	useEffect(() => {
		// A font failure must not leave the user staring at a splash screen -
		// system faces are an acceptable degradation, a dead app is not.
		if (ready || error) void SplashScreen.hideAsync();
	}, [ready, error]);

	if (!ready && !error) return null;
	return (
		<AuthProvider>
			<Stack screenOptions={{ headerShown: false }} />
		</AuthProvider>
	);
}
