export interface Channel {
  id: string;
  name: string;
  logo: string;
  url: string;
  group: string;
  isLive: boolean;
  type?: 'vod' | 'live';  // União discriminada de tipos
  description?: string;
  rating?: string;
  releaseDate?: string;
  epgData?: {
    title: string;
    description: string;
    startTime: string;
    endTime: string;
  };
}