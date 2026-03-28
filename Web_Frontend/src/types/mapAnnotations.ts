export type AnnotationSeverity = 'low' | 'medium' | 'high';

export type MapLocation = {
  id: string;
  lat: number;
  lng: number;
  title: string;
  buildingName?: string;
  floorLabel?: string;
  sublocationLabel?: string;
  summary?: string;
  statusText?: string;
  noiseText?: string;
  occupancyText?: string;
  updatedAtLabel?: string;
  iconType?: string;
  severity?: AnnotationSeverity;
  color?: string;
  isFavorite?: boolean;
};

export type MapAnnotationsResponse = {
  results: MapLocation[];
  error: string;
};
