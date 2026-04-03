const GOOGLE_MAPS_SCRIPT_ID = 'google-maps-javascript-api';

let googleMapsPromise: Promise<any> | null = null;

type WindowWithGoogleMaps = Window & {
  google?: any;
};

function getGoogleMapsFromWindow(): any | null {
  return (window as WindowWithGoogleMaps).google ?? null;
}

export function loadGoogleMapsApi(apiKey: string): Promise<any> {
  if (!apiKey) {
    return Promise.reject(new Error('Missing VITE_GOOGLE_MAPS_API_KEY'));
  }

  const existingGoogleMaps = getGoogleMapsFromWindow();

  if (existingGoogleMaps) {
    return Promise.resolve(existingGoogleMaps);
  }

  if (googleMapsPromise) {
    return googleMapsPromise;
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(
      GOOGLE_MAPS_SCRIPT_ID,
    ) as HTMLScriptElement | null;

    const handleLoad = (): void => {
      const loadedGoogleMaps = getGoogleMapsFromWindow();

      if (loadedGoogleMaps) {
        resolve(loadedGoogleMaps);
        return;
      }

      reject(new Error('Google Maps API loaded without exposing window.google'));
    };

    const handleError = (): void => {
      googleMapsPromise = null;
      reject(new Error('Unable to load the Google Maps JavaScript API'));
    };

    if (existingScript) {
      existingScript.addEventListener('load', handleLoad, { once: true });
      existingScript.addEventListener('error', handleError, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;

    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}
