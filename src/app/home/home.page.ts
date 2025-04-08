import { Component, OnInit, ViewChild, ElementRef, OnDestroy, ChangeDetectorRef, HostListener, ViewChildren, QueryList, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, IonContent } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { Channel } from '../interfaces/channel.interface';
import { ChannelService } from '../services/channel.service';
import Hls from 'hls.js';
import { inject } from "@vercel/analytics";
import { injectSpeedInsights } from '@vercel/speed-insights';
import { ChannelGroup } from '../interfaces/channel-group.interface';
import { OptimizeImageDirective } from '../directives/optimize-image.directive';
import videojs from "video.js";
import { CategoriesService } from '../services/categories.service';
videojs.options.language = 'pt-BR';


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


export class HomePage implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('videoPlayer') playerRef!: ElementRef;
  @ViewChild('playerContainer') playerContainer!: ElementRef;
  @ViewChildren('scrollRow') scrollRows!: QueryList<ElementRef>;
  @ViewChild(IonContent) content!: IonContent;
  @ViewChild('mainToolbar') toolbar!: ElementRef;
  private lastScrollPosition: number = 0;
  private scrollThreshold: number = 100; // Ajuste este valor conforme necessário
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

  private readonly MOVIES_PER_PAGE = 300;
  private currentPage = 1;
  public isLoadingPage = false;
  private loadedGroups = new Set<number>();
  private intersectionObserver?: IntersectionObserver;

  // Adicione esta propriedade
  private readonly PRELOAD_THRESHOLD = 2; // Número de carrosséis antes do fim para iniciar o preload

  constructor(
    private channelService: ChannelService,
    private categoriesService: CategoriesService,
    private cdr: ChangeDetectorRef
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
      this.cdr.detectChanges();
    }
  }

  ngOnDestroy() {
    if (this.player) {
      this.player.dispose();
    }
    if (this.hls) {
      this.hls.destroy();
    }
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
  }

  ngAfterViewInit() {
    if (!this.playerRef) {
      console.error('Elemento do player não foi inicializado.');
    }
    this.setupScrollListener();
  }

  onCategoryChange(event: any) {
    this.filterChannels(event.detail.value);
  }

  // Adicione um método para limpar o cache ao mudar de categoria
  async filterChannels(category: string) {
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

    // Lógica específica para filmes
    if (category === 'movies') {
      this.loadedGroups.clear();
      this.groupedContent = await this.createMovieGroups(this.filteredChannels);
      this.setupIntersectionObserver();
      
      // Observe o último grupo após um pequeno delay
      setTimeout(() => {
        const groupElements = document.querySelectorAll('.group-wrapper');
        if (groupElements.length > 0) {
          const lastGroup = groupElements[groupElements.length - 1];
          this.intersectionObserver?.observe(lastGroup);
        }
      }, 100);
    } else {
      this.updateGroupedContent();
    }

    this.cdr.detectChanges();
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
  
    const groups: ChannelGroup[] = groupNames.map((groupName, index) => {
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
        totalItems: total,
        groupIndex: index // Adicionando o groupIndex requerido
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
    const groups: ChannelGroup[] = groupNames.map((groupName, index) => {
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
        totalItems: total,
        groupIndex: index // Adicionando o groupIndex requerido
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
    console.log('Iniciando reprodução do canal:', channel.name);
    
    this.isPlayerVisible = true;
    this.currentChannel = channel;
    
    // Forçar detecção de mudanças
    this.cdr.detectChanges();
  
    // Criar novo elemento de vídeo
    setTimeout(() => {
      if (!this.playerContainer?.nativeElement) {
        console.error('Container do player não encontrado.');
        return;
      }
  
      // Limpar o container
      this.playerContainer.nativeElement.innerHTML = '';
  
      // Criar novo elemento de vídeo
      const videoElement = document.createElement('video');
      videoElement.id = 'videoPlayer';
      videoElement.className = 'video-js vjs-theme-forest';
      videoElement.controls = true;
      videoElement.preload = 'auto';
      videoElement.setAttribute('playsinline', '');
      videoElement.setAttribute('webkit-playsinline', '');
  
      // Adicionar o elemento ao container
      this.playerContainer.nativeElement.appendChild(videoElement);
  
      // Se já existe um player, destrua-o
      if (this.player) {
        this.player.dispose();
        this.player = null;
      }
  
      // Inicializar novo player
      this.player = videojs(videoElement, {
        autoplay: true,
        controls: true,
    
        skipButtons: {
          forward: 10,
        backward: 10
      },
        preload: 'auto',
        fluid: true,
        preferFullWindow: true,
        language:'pt-br',
        sources: [{
          src: channel.url,
          type: channel.url.endsWith('.m3u8') ? 'application/x-mpegURL' : 'video/mp4'
        }]
      });
  
      // Adicionar listeners de eventos
      this.player.on('error', () => {
        console.error('Erro ao reproduzir o vídeo:', this.player.error());
        this.handlePlaybackError(this.player.error());
      });
  
      // Adicionar listener para ready
      this.player.ready(() => {
        console.log('Player pronto');
        this.player.play().catch((error: any) => {
          console.error('Erro ao iniciar playback:', error);
        });
      });
    }, 100);
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
    console.log('Fechando o player...');

    if (this.player) {
      // Parar a reprodução
      this.player.pause();
      
      // Dispose do player
      this.player.dispose();
      this.player = null;

      // Limpar o container
      if (this.playerContainer?.nativeElement) {
        this.playerContainer.nativeElement.innerHTML = '';
      }
    }

    // Ocultar o container do player
    this.isPlayerVisible = false;
    this.currentChannel = undefined;

    // Forçar detecção de mudanças
    this.cdr.detectChanges();
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
      this.cdr.detectChanges();
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

  private setupScrollListener() {
    this.content.scrollEvents = true;
    
    const content = document.querySelector('ion-content');
    const toolbar = document.querySelector('ion-toolbar');
    const mainContent = document.querySelector('.content-wrapper');
    
    this.content.ionScroll.subscribe((event: any) => {
      const scrollTop = event.detail.scrollTop;
      
      if (scrollTop > this.scrollThreshold && this.lastScrollPosition <= this.scrollThreshold) {
        // Rolando para baixo e passou do threshold
        toolbar?.classList.add('scrolled');
        mainContent?.classList.add('scrolled');
      } else if (scrollTop <= this.scrollThreshold && this.lastScrollPosition > this.scrollThreshold) {
        // Rolando para cima e voltou do threshold
        toolbar?.classList.remove('scrolled');
        mainContent?.classList.remove('scrolled');
      }
      
      this.lastScrollPosition = scrollTop;
    });
  }

  private async createMovieGroups(movies: Channel[]): Promise<ChannelGroup[]> {
    const totalGroups = Math.ceil(movies.length / this.MOVIES_PER_PAGE);
    const initialGroups: ChannelGroup[] = [];
    
    const groupsToLoad = Math.min(2, totalGroups);
    
    // Carregar todas as categorias primeiro
    const categories = await this.categoriesService.getCategories().toPromise();
    
    for (let i = 0; i < groupsToLoad; i++) {
      const start = i * this.MOVIES_PER_PAGE;
      const end = start + this.MOVIES_PER_PAGE;
      const groupItems = movies.slice(start, end);
      
      const categoryName = categories?.find(c => c.id === i + 1)?.group || `Filmes ${i + 1}`;
      
      initialGroups.push({
        name: `Filmes ${categoryName}`,
        items: groupItems,
        hasMore: false,
        totalItems: groupItems.length,
        groupIndex: i
      });
      
      this.loadedGroups.add(i);
    }
    
    return initialGroups;
  }

  private async loadMoreGroups(count: number = 2) {
    if (this.isLoadingPage || !this.filteredChannels) return;

    try {
      this.isLoadingPage = true;
      const totalGroups = Math.ceil(this.filteredChannels.length / this.MOVIES_PER_PAGE);
      
      if (this.loadedGroups.size >= totalGroups) return;

      const categories = await this.categoriesService.getCategories().toPromise();
      const newGroups: ChannelGroup[] = [];
      
      for (let i = 0; i < count; i++) {
        const nextGroupIndex = this.loadedGroups.size;
        if (nextGroupIndex >= totalGroups) break;

        const start = nextGroupIndex * this.MOVIES_PER_PAGE;
        const end = start + this.MOVIES_PER_PAGE;
        const groupItems = this.filteredChannels.slice(start, end);

        const categoryName = categories?.find(c => c.id === nextGroupIndex + 1)?.group || 
                           `Filmes ${nextGroupIndex + 1}`;

        newGroups.push({
          name: `Filmes ${categoryName}`,
          items: groupItems,
          hasMore: false,
          totalItems: groupItems.length,
          groupIndex: nextGroupIndex
        });
        
        this.loadedGroups.add(nextGroupIndex);
      }

      this.groupedContent = [...this.groupedContent, ...newGroups];
      
    } finally {
      this.isLoadingPage = false;
      this.cdr.detectChanges();
    }
  }

  private setupIntersectionObserver() {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }

    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const groupElement = entry.target as HTMLElement;
            const groupIndex = parseInt(groupElement.getAttribute('data-group-index') || '0');
            
            // Se estamos próximos do fim dos grupos carregados
            if (groupIndex >= this.loadedGroups.size - this.PRELOAD_THRESHOLD) {
              this.loadMoreGroups(2); // Carrega mais 2 grupos
            }
          }
        });
      },
      {
        root: null,
        rootMargin: '50px',
        threshold: 0.1
      }
    );

    // Observa todos os grupos
    this.observeGroups();
  }

  // Adicione este novo método
  private observeGroups() {
    setTimeout(() => {
      const groupElements = document.querySelectorAll('.group-wrapper');
      groupElements.forEach(element => {
        this.intersectionObserver?.observe(element);
      });
    }, 100);
  }

  // Adicione um evento de mouse enter nos carrosséis
  onGroupHover(event: MouseEvent, groupIndex: number) {
    if (typeof groupIndex === 'number' && groupIndex >= this.loadedGroups.size - this.PRELOAD_THRESHOLD) {
      this.loadMoreGroups(2);
    }
  }
}
//telemetria do servidor
inject();
injectSpeedInsights();