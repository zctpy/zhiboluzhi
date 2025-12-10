export interface ChatMessage {
  id: string;
  username: string;
  message: string;
  color: string;
  isSystem?: boolean;
}

export interface FloatingHeart {
  id: number;
  left: number; // percentage
  color: string;
}

export type StreamStatus = 'idle' | 'live' | 'recording';

export interface ViewerConfig {
  count: number;
  likes: number;
}