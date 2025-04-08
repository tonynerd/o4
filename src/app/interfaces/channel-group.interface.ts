import { Channel } from './channel.interface';

export interface ChannelGroup {
  name: string;
  items: Channel[];
  hasMore: boolean;
  totalItems: number;
  groupIndex: number; // Removido o opcional (?)
}