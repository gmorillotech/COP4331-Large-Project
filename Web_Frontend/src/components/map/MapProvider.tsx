import type { ReactNode } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';

type MapProviderProps = {
  apiKey: string;
  children: ReactNode;
};

// Wraps children in APIProvider, which:
//   - Injects the Google Maps bootstrap script exactly once
//   - Makes useMap(), useMapsLibrary(), useApiIsLoaded() available to all descendants
//   - Handles script loading and error state internally
function MapProvider({ apiKey, children }: MapProviderProps) {
  return (
    <APIProvider apiKey={apiKey}>
      {children}
    </APIProvider>
  );
}

export default MapProvider;