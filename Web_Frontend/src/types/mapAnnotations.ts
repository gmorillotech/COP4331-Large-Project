export type AnnotationSeverity = 'low' | 'medium' | 'high';

export type MapAnnotation = {
  id: string;
  lat: number;
  lng: number;
  title: string;
  body: string;
  iconType?: string;
  severity?: AnnotationSeverity;
  color?: string;
  isSelected?: boolean;
};

export type MapAnnotationsResponse = {
  results: MapAnnotation[];
  error: string;
};
