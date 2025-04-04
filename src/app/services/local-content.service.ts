import { Injectable } from '@angular/core';
import { Channel } from '../interfaces/channel.interface';

interface VODContent {
  stream_id: number;
  name: string;
  stream_icon?: string;
  category_id?: number;
  description?: string;
  rating?: string;
  releaseDate?: string;
  added?: string;
  logo_url: string;
  stream_url: string;
  'group-title'?: string;
}

@Injectable({
  providedIn: 'root'
})
export class LocalContentService {
  async parseLocalContent(): Promise<Channel[]> {
    try {
      // Carrega todos os arquivos em paralelo
      const [m3uResponse, xmlResponse, vodData] = await Promise.all([
        fetch('assets/epg.m3u').then(res => res.text()),
        fetch('assets/epg.xml').then(res => res.text()),
        this.loadVODContent() // Usa o novo método
      ]);
      
      // Parse dos canais ao vivo do M3U
      const liveChannels = this.parseM3U(m3uResponse);
      
      // Enriquece canais ao vivo com dados do EPG
      const enrichedLiveChannels = this.enrichWithEPG(liveChannels, xmlResponse);
      
      // Parse e converte os VODs para o formato Channel
      const vodChannels = this.parseVODs(vodData);
      
      // Combina canais ao vivo e VODs
      return [...enrichedLiveChannels, ...vodChannels];
    } catch (error) {
      console.error('Erro ao carregar conteúdo local:', error);
      return [];
    }
  }

  private parseM3U(content: string): Channel[] {
    const channels: Channel[] = [];
    const lines = content.split('\n');
    let currentChannel: Partial<Channel> = {};

    lines.forEach(line => {
      if (line.startsWith('#EXTINF:')) {
        // Parse das informações do canal do M3U
        const info = line.substring(8).split(',');
        const [attributes, name] = info;
        
        currentChannel = {
          name: name.trim(),
          group: this.extractAttribute(attributes, 'group-title'),
          logo: this.extractAttribute(attributes, 'tvg-logo'),
          id: this.extractAttribute(attributes, 'tvg-id')
        };
      } else if (line.trim() && !line.startsWith('#')) {
        // Adiciona a URL e finaliza o canal
        currentChannel.url = line.trim();
        channels.push(currentChannel as Channel);
        currentChannel = {};
      }
    });

    return channels;
  }

  private enrichWithEPG(channels: Channel[], xmlContent: string): Channel[] {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
    const programmes = xmlDoc.getElementsByTagName('programme');

    return channels.map(channel => {
      if (!channel.id) return channel;

      const currentTime = new Date().getTime();
      const currentProgramme = Array.from(programmes).find(prog => {
        const start = new Date(prog.getAttribute('start') || '').getTime();
        const stop = new Date(prog.getAttribute('stop') || '').getTime();
        return prog.getAttribute('channel') === channel.id &&
               currentTime >= start && currentTime <= stop;
      });

      if (currentProgramme) {
        channel.epgData = {
          title: currentProgramme.querySelector('title')?.textContent || '',
          description: currentProgramme.querySelector('desc')?.textContent || '',
          startTime: currentProgramme.getAttribute('start') || '',
          endTime: currentProgramme.getAttribute('stop') || ''
        };
      }

      return channel;
    });
  }

  private extractAttribute(attributes: string, name: string): string {
    const regex = new RegExp(`${name}="([^"]*)"`, 'i');
    const match = attributes.match(regex);
    return match ? match[1] : '';
  }

  private parseVODs(vodContent: any): Channel[] {
    console.log('Iniciando parseVODs com:', vodContent?.length, 'itens');
    
    if (!Array.isArray(vodContent)) {
      console.warn('Conteúdo VOD inválido:', vodContent);
      return [];
    }

    const channels = vodContent
      .filter(vod => {
        const isValid = vod && vod.name && vod.stream_url;
        if (!isValid) {
          console.warn('VOD inválido:', vod);
        }
        return isValid;
      })
      .map(vod => {
        const channel: Channel = {
          id: Math.random().toString(36).substr(2, 9), // Gera ID único
          name: vod.name,
          logo: vod.logo_url || '',
          url: vod.stream_url,
          group: vod['group-title'] || 'Filmes',
          type: 'vod' as const,
          isLive: false,
          description: '',
          rating: '',
          releaseDate: this.extractYearFromGroup(vod['group-title']) || ''
        };
        console.log('VOD processado:', channel.name);
        return channel;
      });

    console.log(`Total de VODs processados: ${channels.length}`);
    return channels;
  }

  private async loadVODContent(): Promise<any[]> {
    try {
      console.log('Iniciando carregamento de VODs...');
      const response = await fetch('assets/epg.json');
      const data = await response.json();
      console.log('Dados JSON carregados:', data);
      
      // Verifica estrutura do JSON
      if (typeof data === 'object' && data !== null) {
        // Tenta encontrar os VODs em diferentes estruturas possíveis
        let vods = [];
        
        if (Array.isArray(data)) {
          console.log('Dados em formato de array');
          vods = data;
        } else if (data.vods && Array.isArray(data.vods)) {
          console.log('Dados em formato objeto com propriedade vods');
          vods = data.vods;
        } else if (data.movies && Array.isArray(data.movies)) {
          console.log('Dados em formato objeto com propriedade movies');
          vods = data.movies;
        } else {
          // Tenta encontrar a primeira propriedade que é um array
          const arrayProp = Object.values(data).find(val => Array.isArray(val));
          if (arrayProp) {
            console.log('Encontrado array em propriedade do objeto');
            vods = arrayProp;
          }
        }

        console.log(`Total de VODs encontrados: ${vods.length}`);
        return vods;
      }
      
      console.warn('Formato de dados inválido:', data);
      return [];
    } catch (error) {
      console.error('Erro ao carregar VODs:', error);
      return [];
    }
  }

  // Auxiliar para determinar grupo do VOD baseado no nome
  private determineVODGroup(name: string): string {
    const nameLower = name.toLowerCase();
    
    if (nameLower.includes('temporada') || 
        nameLower.includes('season') || 
        nameLower.includes('episodio') || 
        nameLower.includes('episode')) {
      return 'Séries';
    }
    
    return 'Filmes';
  }

  private extractYearFromGroup(groupTitle: string | undefined): string {
    if (!groupTitle) return '';
    
    const yearMatch = groupTitle.match(/\b(19|20)\d{2}\b/);
    return yearMatch ? yearMatch[0] : '';
  }
}