export type Waypoint = {
  id: string;
  code?: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  sortOrder?: number;
};
