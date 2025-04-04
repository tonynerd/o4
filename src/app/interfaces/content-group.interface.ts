import { Channel } from './channel.interface';

export interface ContentGroup {
  name: string;
  items: Channel[];
  hasMore: boolean;
  totalItems: number; // Adicionando a propriedade que faltava
}