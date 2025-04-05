import { Component, OnInit, ViewChild, ElementRef, OnDestroy, ChangeDetectorRef, HostListener, ViewChildren, QueryList } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { Channel } from '../interfaces/channel.interface';
import { ChannelService } from '../services/channel.service';
import Hls from 'hls.js';
import { inject } from "@vercel/analytics";
import { ChannelGroup } from '../interfaces/channel-group.interface';
import { OptimizeImageDirective } from '../directives/optimize-image.directive';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonicModule,
    FormsModule,
    OptimizeImageDirective
  ],
})


export class HomePage implements OnInit, OnDestroy {
  @ViewChild('player') playerRef!: ElementRef;
  @ViewChildren('scrollRow') scrollRows!: QueryList<ElementRef>;
  private scrollPositions = new Map<string, number>();

  isLoading = true;
  error?: string;
  channels: Channel[] = [];
  filteredChannels: Channel[] = [];
  selectedCategory = 'live';
  categories = [
    { id: 'live', name: 'TV ao Vivo', icon: 'canais-ao-vivo.svg' },
    { id: 'sports', name: 'Esportes', icon: 'sport-icon.svg' },
    { id: 'movies', name: 'Filmes', icon: 'filmes.svg' },
    { id: 'series', name: 'Séries', icon: 'séries.svg' },
    { id: 'bbb', name: 'BBB 25', icon: 'bbb-icon.svg' }
  ];
  isPlayerVisible = false;
  currentChannel?: Channel;
  private hls?: Hls;

  slideOpts = {
    slidesPerView: 'auto',
    spaceBetween: 10,
    freeMode: true
  };
  player: any;

  private readonly INITIAL_LOAD = 30; // Aumentado para melhor experiência inicial
  private readonly LOAD_MORE_COUNT = 10;
  private readonly SCROLL_THRESHOLD = 0.8;

  isLoadingMore = false;

  // Adicione um Map para armazenar os itens de cada grupo
  private groupItems = new Map<string, Channel[]>();

  groupedContent: ChannelGroup[] = [];

  constructor(
    private channelService: ChannelService,
    private changeDetectorRef: ChangeDetectorRef
  ) {}

  
  async ngOnInit() {
    try {
      this.isLoading = true;
      this.error = undefined;
      
      console.log('Iniciando carregamento...');
      const loadedChannels = await this.channelService.loadAllContent();
      
      console.log('Canais carregados:', loadedChannels?.length || 0);
      
      if (!loadedChannels || loadedChannels.length === 0) {
        throw new Error('Nenhum canal disponível no momento');
      }

      // Limita a quantidade inicial de canais para melhor performance
      this.channels = loadedChannels.slice(0, 45000); // Carrega apenas os primeiros 1000
      this.filterChannels('live');
      
      console.log(`${this.channels.length} canais carregados com sucesso`);
      
    } catch (error: any) {
      this.error = error.message || 'Erro desconhecido ao carregar conteúdo';
      console.error('Erro detalhado:', error);
    } finally {
      this.isLoading = false;
      this.changeDetectorRef.detectChanges();
    }
  }

  ngOnDestroy() {
    // Garante que o HLS seja destruído ao sair da página
    if (this.hls) {
      this.hls.destroy();
    }
  }

  onCategoryChange(event: any) {
    this.filterChannels(event.detail.value);
  }

  // Adicione um método para limpar o cache ao mudar de categoria
  filterChannels(category: string) {
    console.log('Filtrando por categoria:', category);
    this.selectedCategory = category;
    
    // Limpa o cache de grupos ao trocar de categoria
    this.groupItems.clear();
    
    if (!this.channels || this.channels.length === 0) {
      console.log('Sem canais para filtrar');
      this.filteredChannels = [];
      this.groupedContent = [];
      return;
    }

    this.filteredChannels = this.channels.filter(channel => 
      this.matchesCategory(channel, category)
    );

    console.log(`Filtrados ${this.filteredChannels.length} canais`);
    this.updateGroupedContent(); // Atualiza os grupos uma vez
    this.changeDetectorRef.detectChanges();
  }

  private matchesCategory(channel: Channel, category: string): boolean {
    if (!channel.group) return false;
    
    const groupLower = channel.group.toLowerCase();
    const nameLower = channel.name.toLowerCase();
  
    // Verifica se é um canal de esportes
    const isSports = groupLower.includes('esporte') || 
                    groupLower.includes('sports') ||
                    groupLower.includes('espn') ||
                    groupLower.includes('sportv') ||
                    groupLower.includes('premiere') ||
                    groupLower.includes('dazn') ||
                    groupLower.includes('paramount') ||
                    groupLower.includes('ppv') ||
                    groupLower.includes('programação esportiva') ||
                    groupLower.includes('alternativos 2') ||
                    groupLower.includes('ufc') ||
                    groupLower.includes('gols da rodada') ||
                    groupLower.includes('nba');

    switch (category) {
      case 'live':
        // Exclui canais esportivos e outros da TV ao vivo
        return !isSports && 
               !groupLower.includes('filme') && 
               !groupLower.includes('movie') &&
               !groupLower.includes('série') &&
               !groupLower.includes('series') &&
               !groupLower.includes('portugal') &&
               !groupLower.includes('méxico') &&
               !groupLower.includes('mexico') &&
               !groupLower.includes('latino') &&
               !groupLower.includes('eua') &&
               !groupLower.includes('espanha') &&
               !groupLower.includes('canadá') &&
               !groupLower.includes('canada') &&
               !groupLower.includes('argentina') &&
               !groupLower.includes('diversos') &&
               !groupLower.includes('documentários') &&
               !groupLower.includes('documentarios') &&
               !groupLower.includes('novelas') &&
               !groupLower.includes('programas de tv') &&
               !groupLower.includes('bbb');
               
      case 'sports':
        // Inclui apenas canais esportivos
        return isSports;
        
      case 'movies':
        return groupLower.includes('filme') || 
               groupLower.includes('movie');
               
      case 'series':
        return groupLower.includes('série') || 
               groupLower.includes('series');
               
      case 'bbb':
        return groupLower.includes('bbb');
               
      default:
        return false;
    }
  }

  private updateGroupedContent() {
    if (!this.filteredChannels.length) {
      this.groupedContent = [];
      return;
    }
  
    const groupNames = Array.from(new Set(this.filteredChannels.map(ch => ch.group || 'Outros')));
  
    const groups: ChannelGroup[] = groupNames.map(groupName => {
      let items = this.groupItems.get(groupName);
      if (!items) {
        // Se ainda não tiver itens para o grupo, pega os itens filtrados e limita pela carga inicial
        const allGroupItems = this.filteredChannels.filter(ch => (ch.group || 'Outros') === groupName);
        items = allGroupItems.slice(0, this.INITIAL_LOAD);
        this.groupItems.set(groupName, items);
      }
      const total = this.filteredChannels.filter(ch => (ch.group || 'Outros') === groupName).length;
      return {
        name: this.formatGroupName(groupName),
        items: items,
        hasMore: items.length < total,
        totalItems: total
      };
    });
  
    this.groupedContent = groups.sort((a, b) => a.name.localeCompare(b.name));
  }

  getSuggestedMovies(): Channel[] {
    return this.filteredChannels
      .filter(channel => channel.type === 'vod')
      .slice(0, 7);
  }

  getGroupedContent(): ChannelGroup[] {
    if (!this.filteredChannels.length) {
      return [];
    }
  
    // Obtem todos os nomes de grupo distintos
    const groupNames = Array.from(new Set(this.filteredChannels.map(ch => ch.group || 'Outros')));
  
    // Para cada grupo, use o groupItems se já existir ou inicialize com INITIAL_LOAD
    const groups: ChannelGroup[] = groupNames.map(groupName => {
      let items = this.groupItems.get(groupName);
      if (!items) {
        // Se ainda não tiver itens para o grupo, pega os itens filtrados e limita pela carga inicial
        const allGroupItems = this.filteredChannels.filter(ch => (ch.group || 'Outros') === groupName);
        items = allGroupItems.slice(0, this.INITIAL_LOAD);
        this.groupItems.set(groupName, items);
      }
      const total = this.filteredChannels.filter(ch => (ch.group || 'Outros') === groupName).length;
      return {
        name: this.formatGroupName(groupName),
        items: items,
        hasMore: items.length < total,
        totalItems: total
      };
    });
  
    return groups.sort((a, b) => a.name.localeCompare(b.name));
  }

  private getTotalItemsForGroup(groupName: string): number {
    return this.filteredChannels.filter(
      ch => (ch.group || 'Outros') === groupName
    ).length;
  }

  private formatGroupName(name: string): string {
    // Formata o nome do grupo para exibição
    const groupMap: Record<string, string> = {
      'sports': 'Esportes',
      'movies': 'Filmes',
      'series': 'Séries',
      'bbb': 'BBB 25',
      'live': 'TV ao Vivo'
    };
    
    return groupMap[name.toLowerCase()] || name;
  }

  playVideo(channel: Channel) {
    if (!this.playerRef?.nativeElement) return;
    
    const video = this.playerRef.nativeElement;
    this.currentChannel = channel;
    this.isPlayerVisible = true;
    console.log(this.isPlayerVisible);
    
    if (this.hls) {
      this.hls.destroy();
      this.hls = undefined;
    }
    
    // Verifica se é conteúdo ao vivo baseado na categoria e URL
    const isLiveContent = this.selectedCategory === 'live' || 
                         this.selectedCategory === 'sports' ||
                         channel.url.includes('.m3u8');
    
    if (isLiveContent) {
      console.log('Iniciando reprodução de conteúdo ao vivo:', channel.name);
      console.log('URL do stream:', channel.url);
      
      if (Hls.isSupported()) {
        this.hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 90,
          maxBufferLength: 30,
          maxMaxBufferLength: 600,
          maxBufferSize: 60 * 1000 * 1000
        });
        
        this.hls.attachMedia(video);
        this.hls.on(Hls.Events.MEDIA_ATTACHED, () => {
          console.log('HLS Media Attached');
          this.hls?.loadSource(channel.url);
        });
        
        this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log('HLS Manifest Parsed');
          video.play()
            .then(() => this.requestFullscreen(video))
            .catch((error: any) => {
              console.error('Erro ao iniciar playback:', error);
              this.handlePlaybackError(error);
            });
        });
        
        this.hls.on(Hls.Events.ERROR, (event, data) => {
          console.error('Erro HLS:', data);
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.log('Tentando recuperar erro de rede...');
                this.hls?.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.log('Tentando recuperar erro de mídia...');
                this.hls?.recoverMediaError();
                break;
              default:
                console.error('Erro fatal:', data);
                this.closePlayer();
                break;
            }
          }
        });
      } else {
        // Fallback para navegadores que suportam HLS nativamente (Safari)
        video.src = channel.url;
        video.load();
        video.play()
          .then(() => this.requestFullscreen(video))
          .catch((error: Error) => {
            console.error('Erro ao reproduzir em modo nativo:', error);
            this.handlePlaybackError(error);
          });
      }
    } else {
      // Conteúdos VOD
      video.src = channel.url;
      video.load();
      video.play()
        .then(() => this.requestFullscreen(video))
        .catch((error: Error) => {
          console.error('Erro ao reproduzir VOD:', error);
          this.handlePlaybackError(error);
        });
    }
}

private handlePlaybackError(error: Error | DOMException): void {
  console.error('Erro de reprodução:', error);
  // TODO: Implementar lógica de tratamento de erro
  // Por exemplo: mostrar toast/alert para o usuário
}

  private requestFullscreen(element: HTMLElement) {
    try {
      if (element.requestFullscreen) {
        element.requestFullscreen();
      } else if ((element as any).webkitRequestFullscreen) {
        (element as any).webkitRequestFullscreen();
      } else if ((element as any).mozRequestFullScreen) {
        (element as any).mozRequestFullScreen();
      } else if ((element as any).msRequestFullscreen) {
        (element as any).msRequestFullscreen();
      }
    } catch (error) {
      console.error('Erro ao entrar em tela cheia:', error);
    }
  }

  enterFullscreen() {
    const video = this.playerRef.nativeElement;
    try {
      if (video.requestFullscreen) {
        video.requestFullscreen();
      } else if ((video as any).webkitRequestFullscreen) {
        (video as any).webkitRequestFullscreen();
      } else if ((video as any).mozRequestFullScreen) {
        (video as any).mozRequestFullScreen();
      } else if ((video as any).msRequestFullscreen) {
        (video as any).msRequestFullscreen();
      }
    } catch (error) {
      console.error('Erro ao entrar em tela cheia:', error);
    }
  }

  closePlayer() {
    if (this.playerRef?.nativeElement) {
      const video = this.playerRef.nativeElement;
      video.pause();
      video.removeAttribute('src');
      video.load();
      
      if (this.hls) {
        this.hls.destroy();
        this.hls = undefined;
      }
      
      // Sai do modo tela cheia se necessário
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(err => 
          console.error('Erro ao sair da tela cheia:', err)
        );
      }
      
      this.isPlayerVisible = false;
      console.log(this.isPlayerVisible);
      this.currentChannel = undefined;
      this.changeDetectorRef.detectChanges(); // Força atualização da view
    }
  }

  searchChannels(event: any) {
    const searchTerm = event.target.value;
    if (searchTerm && searchTerm.trim() !== '') {
      this.filteredChannels = this.channels.filter(channel =>
        channel.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    } else {
      this.filteredChannels = [...this.channels];
    }
  }

  async loadMoreForGroup(groupName: string, container?: HTMLElement) {
    if (this.isLoadingMore) return;
    
    try {
      this.isLoadingMore = true;
      // Guarde a posição atual antes da atualização
      const previousScroll = container ? container.scrollLeft : 0;
      console.log(`Carregando mais itens para: ${groupName}`);

      const currentItems = this.groupItems.get(groupName) || [];
      const allGroupItems = this.filteredChannels.filter(
        ch => (ch.group || 'Outros') === groupName
      );

      const nextItems = allGroupItems.slice(
        currentItems.length,
        currentItems.length + this.LOAD_MORE_COUNT
      );

      if (nextItems.length > 0) {
        const updatedItems = [...currentItems, ...nextItems];
        this.groupItems.set(groupName, updatedItems);

        console.log(`Adicionados ${nextItems.length} novos itens ao grupo ${groupName}`);
        console.log(`Total de itens no grupo agora: ${updatedItems.length}`);

        // Atualiza groupedContent sem recriar os grupos a partir do zero
        this.updateGroupedContent();
      }
    } catch (error) {
      console.error('Erro ao carregar mais itens:', error);
    } finally {
      this.isLoadingMore = false;
      this.changeDetectorRef.detectChanges();
      // Restaura a posição de scroll, se disponível
      if (container && this.scrollPositions.has(groupName)) {
        container.scrollLeft = this.scrollPositions.get(groupName)!;
      }
    }
  }

  onGroupScroll(event: Event, groupName: string) {
    if (this.isLoadingMore) return;
    
    const container = event.target as HTMLElement;
    // Salva a posição atual
    this.scrollPositions.set(groupName, container.scrollLeft);
    
    const scrollPosition = container.scrollLeft;
    const containerWidth = container.clientWidth;
    const scrollWidth = container.scrollWidth;
    
    if (scrollPosition + containerWidth >= scrollWidth * this.SCROLL_THRESHOLD) {
      this.loadMoreForGroup(groupName, container);
    }
  }

  trackGroupBy(index: number, group: ChannelGroup): string {
    return group.name;
  }
}inject();