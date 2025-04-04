import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Channel } from '../interfaces/channel.interface';
import { LocalContentService } from './local-content.service';

interface VODResponse {
  stream_id: number;
  name: string;
  logo: string;
  stream_icon?: string;
  isNacional?: boolean;
  group: string;
  category_id?: number;
  added?: string;
  posterPath?: string;
  description?: string;
  rating?: string;
  releaseDate?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ChannelService {
  private baseUrl = 'http://dns.rbtvon.fun';
  private credentials = {
    username: '79542178',
    password: '47741194'
  };
  private worker?: Worker;

  constructor(private http: HttpClient, private localContentService: LocalContentService) {
    if (typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(new URL('../workers/channel.worker', import.meta.url), { type: 'module' });
        console.log('Worker inicializado com sucesso');
      } catch (error) {
        console.error('Erro ao inicializar worker:', error);
      }
    }
  }

  async loadAllContent(): Promise<Channel[]> {
    try {
      // Primeiro tenta carregar localmente
      const localChannels = await this.localContentService.parseLocalContent();
      
      if (localChannels.length > 0) {
        return localChannels;
      }

      // Se falhar, usa o fallback para API
      return this.loadFromAPI();
    } catch (error) {
      console.error('Erro ao carregar conteúdo:', error);
      return [];
    }
  }

  private async loadFromAPI(): Promise<Channel[]> {
    try {
      console.log('Iniciando carregamento do conteúdo...');
      
      const url = `${this.baseUrl}/get.php?username=${this.credentials.username}&password=${this.credentials.password}&type=m3u_plus&output=hls`;
      
      const m3uResponse = await firstValueFrom(
        this.http.get(url, { responseType: 'text' })
      ).catch(error => {
        console.error('Erro ao fazer requisição HTTP:', error);
        throw error;
      });

      if (!m3uResponse) {
        throw new Error('Resposta M3U vazia');
      }

      console.log('Conteúdo M3U recebido, iniciando processamento...');
      const channels = await this.processWithWorkerInBatches(m3uResponse);
      console.log(`Processamento concluído: ${channels.length} canais carregados`);
      
      return channels;
    } catch (error) {
      console.error('Erro ao carregar conteúdo:', error);
      throw error; // Propaga o erro para ser tratado no componente
    }
  }

  private processWithWorker(action: string, content: string): Promise<Channel[]> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        console.error('Worker não disponível, usando fallback');
        // Fallback para processamento síncrono
        try {
          const channels = this.parseM3U(content);
          resolve(channels);
        } catch (error) {
          reject(error);
        }
        return;
      }

      const messageHandler = (event: MessageEvent) => {
        this.worker?.removeEventListener('message', messageHandler);
        if (event.data.error) {
          reject(new Error(event.data.error));
        } else {
          resolve(event.data);
        }
      };

      this.worker.addEventListener('message', messageHandler);
      this.worker.addEventListener('error', (error) => {
        console.error('Erro no worker:', error);
        reject(error);
      });

      this.worker.postMessage({ action, content });
    });
  }

  private processWithWorkerInBatches(content: string): Promise<Channel[]> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        console.warn('Worker não disponível, usando processamento síncrono');
        try {
          const channels = this.parseM3U(content);
          resolve(channels);
        } catch (error) {
          reject(error);
        }
        return;
      }

      let processedChannels: Channel[] = [];
      let isProcessing = false;

      const messageHandler = (event: MessageEvent) => {
        if (event.data.error) {
          this.worker?.removeEventListener('message', messageHandler);
          reject(new Error(event.data.error));
          return;
        }

        if (event.data.finished) {
          this.worker?.removeEventListener('message', messageHandler);
          resolve(processedChannels);
          return;
        }

        if (event.data.channels) {
          processedChannels = processedChannels.concat(event.data.channels);
          console.log(`Processados ${processedChannels.length} canais`);
        }
      };

      this.worker.addEventListener('message', messageHandler);
      this.worker.addEventListener('error', (error) => {
        console.error('Erro no worker:', error);
        this.worker?.removeEventListener('message', messageHandler);
        reject(error);
      });

      // Envia o conteúdo para o worker processar em lotes
      this.worker.postMessage({ 
        action: 'parseM3U',
        content,
        batchSize: 100 // Processa 100 canais por vez
      });
    });
  }

  // Método fallback para quando o worker não estiver disponível
  private parseM3U(content: string): Channel[] {
    const channels: Channel[] = [];
    const lines = content.split('\n');
    let currentChannel: Partial<Channel> = {};

    lines.forEach(line => {
      const trimmedLine = line.trim();
      
      if (trimmedLine.startsWith('#EXTINF:')) {
        const idMatch = trimmedLine.match(/tvg-id="([^"]*)"/);
        const nameMatch = trimmedLine.match(/,(.*)$/);
        const groupMatch = trimmedLine.match(/group-title="([^"]*)"/);
        const logoMatch = trimmedLine.match(/tvg-logo="([^"]*)"/);
        const group = groupMatch ? groupMatch[1] : 'Outros';

        // Determina o tipo baseado no grupo
        const type = this.determineChannelType(group);

        currentChannel = {
          id: idMatch ? idMatch[1] : undefined,
          name: nameMatch ? nameMatch[1].trim() : 'Sem nome',
          group: group,
          logo: logoMatch ? logoMatch[1] : 'assets/images/default-channel.png',
          type: type,
          isLive: type === 'live'
        };
      } else if (trimmedLine.startsWith('http')) {
        if (currentChannel.name) {
          // Se for canal ao vivo e tivermos um id válido, usa buildStreamUrl para garantir o formato .m3u8
          if (currentChannel.isLive && currentChannel.id) {
            currentChannel.url = this.buildStreamUrl(currentChannel.id);
          } else {
            currentChannel.url = trimmedLine;
          }
          channels.push({
            ...currentChannel
          } as Channel);
        }
        currentChannel = {};
      }
    });

    return channels;
  }

  private determineChannelType(group: string): 'live' | 'vod' {
    const groupLower = group.toLowerCase();
    
    // Se o grupo contiver estas palavras, é considerado VOD
    const vodPatterns = [
      'filme',
      'movie',
      'série',
      'series',
      'documentário',
      'documentarios',
      'diversos',
    ];

    return vodPatterns.some(pattern => groupLower.includes(pattern)) ? 'vod' : 'live';
  }

  private async loadM3UChannels(): Promise<Channel[]> {
    // Exemplo carregando um arquivo local
    const m3uUrl = '../assets/epg.m3u';
    try {
      const response = await firstValueFrom(this.http.get(m3uUrl, { responseType: 'text' }));
      return this.parseM3U(response);
    } catch (error) {
      console.error('Erro ao carregar M3U:', error);
      return [];
    }
  }

  private async loadEPGData(): Promise<any[]> {
    const epgUrl = `${this.baseUrl}/xmltv.php?username=${this.credentials.username}&password=${this.credentials.password}`;
    
    try {
      const response = await firstValueFrom(
        this.http.get(epgUrl, { responseType: 'text' })
      );
      
      return this.parseXMLContent(response);
    } catch (error) {
      console.error('Erro ao carregar EPG:', error);
      return [];
    }
  }

  private enrichChannelsWithEPG(m3uChannels: Channel[], epgData: any[]): Channel[] {
    return m3uChannels.map(channel => {
      const epgInfo = epgData.find(epg => epg.id === channel.id);
      if (epgInfo) {
        return {
          ...channel,
          epgData: {
            title: epgInfo.title,
            description: epgInfo.description,
            startTime: epgInfo.startTime,
            endTime: epgInfo.endTime
          }
        };
      }
      return channel;
    });
  }

  private determineChannelGroup(channelName: string): string {
    const name = channelName.toLowerCase();
    
    if (name.includes('sport') || name.includes('espn') || 
        name.includes('premiere') || name.includes('sportv') || name.includes('nba') || name.includes('tnt')) {
      return 'sports';
    } else if (name.includes('filme') || name.includes('movie') || 
               name.includes('telecine') || name.includes('megapix')) {
      return 'movies';
    } else if (name.includes('série') || name.includes('warner') || 
               name.includes('sony') || name.includes('universal')) {
      return 'series';
    } else if (name.includes('bbb') || name.includes('big brother')) {
      return 'bbb';
    } else {
      return 'live';
    }
  }

  private async loadVODs(): Promise<Channel[]> {
    const vodUrl = `${this.baseUrl}/player_api.php?username=${this.credentials.username}&password=${this.credentials.password}&action=get_vod_streams`;
    
    try {
      const response = await firstValueFrom(
        this.http.get<VODResponse[]>(vodUrl)
      );
      
      return this.parseVODs(response);
    } catch (error) {
      console.error('Erro ao carregar VODs:', error);
      return [];
    }
  }

  private parseVODs(vodData: VODResponse[]): Channel[] {
    return vodData.map(vod => ({
      id: vod.stream_id.toString(),
      name: vod.name,
      logo: vod.stream_icon || vod.logo || 'assets/images/default-thumb.jpg',
      type: 'vod',
      group: this.determineVODGroup(vod.category_id || 0),
      url: this.buildVODUrl(vod.stream_id.toString()),
      isLive: false,
      poster: vod.stream_icon || vod.logo,
      description: vod.description || '',
      rating: vod.rating || 'N/A',
      releaseDate: vod.added || vod.releaseDate || ''
    }));
  }

  private buildStreamUrl(channelId: string): string {
    return `${this.baseUrl}/live/${this.credentials.username}/${this.credentials.password}/${channelId}.m3u8`;
  }

  private buildVODUrl(streamId: string): string {
    return `${this.baseUrl}/movie/${this.credentials.username}/${this.credentials.password}/${streamId}.mp4`;
  }

  private determineVODGroup(categoryId: number): string {
    // Mapeamento de category_id para grupos
    const categoryMap: { [key: number]: string } = {
      1: 'live',
      2: 'movies',
      3: 'series',
      4: 'sports',
      5: 'bbb'
      // Adicione mais mapeamentos conforme necessário
    };
    
    return categoryMap[categoryId] || 'others';
  }

  private parseXMLContent(xmlContent: string): any[] {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
      const programmes = xmlDoc.getElementsByTagName('programme');
      const epgData = [];

      for (let i = 0; i < programmes.length; i++) {
        const programme = programmes[i];
        const channelId = programme.getAttribute('channel');
        const startTime = programme.getAttribute('start');
        const endTime = programme.getAttribute('stop');
        const title = programme.getElementsByTagName('title')[0]?.textContent || '';
        const description = programme.getElementsByTagName('desc')[0]?.textContent || '';

        epgData.push({
          id: channelId,
          title,
          description,
          startTime: this.formatEPGDate(startTime || ''),
          endTime: this.formatEPGDate(endTime || ''),
          currentProgram: title,
          nextProgram: this.findNextProgram(programmes, i, channelId || '')
        });
      }

      return epgData;
    } catch (error) {
      console.error('Erro ao processar XML:', error);
      return [];
    }
  }

  private formatEPGDate(dateString: string): string {
    try {
      // EPG dates são geralmente no formato "20240305123000 +0000"
      const year = dateString.substring(0, 4);
      const month = dateString.substring(4, 6);
      const day = dateString.substring(6, 8);
      const hour = dateString.substring(8, 10);
      const minute = dateString.substring(10, 12);
      
      return new Date(
        `${year}-${month}-${day}T${hour}:${minute}:00`
      ).toLocaleString('pt-BR');
    } catch (error) {
      console.error('Erro ao formatar data:', error);
      return '';
    }
  }

  private findNextProgram(programmes: HTMLCollectionOf<Element>, currentIndex: number, channelId: string): string {
    for (let i = currentIndex + 1; i < programmes.length; i++) {
      const programme = programmes[i];
      if (programme.getAttribute('channel') === channelId) {
        return programme.getElementsByTagName('title')[0]?.textContent || '';
      }
    }
    return '';
  }
}