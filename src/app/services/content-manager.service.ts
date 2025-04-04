import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Channel } from '../interfaces/channel.interface';
import { ContentGroup } from '../interfaces/content-group.interface';

@Injectable({
  providedIn: 'root'
})
export class ContentManagerService {
  private readonly ITEMS_PER_PAGE = 5;
  private readonly LOAD_MORE_COUNT = 10;
  
  private channelsSubject = new BehaviorSubject<Channel[]>([]);
  private filteredContentSubject = new BehaviorSubject<ContentGroup[]>([]);
  
  private categoryFilters = {
    live: (channel: Channel) => 
      channel.type === 'live' && !this.isSpecialContent(channel),
    
    sports: (channel: Channel) => 
      channel.type === 'live' && this.isSportsContent(channel),
    
    movies: (channel: Channel) => 
      channel.type === 'vod' && !this.isMoviesContent(channel),
    
    series: (channel: Channel) => 
      channel.type === 'vod' && this.isSeriesContent(channel),
    
    bbb: (channel: Channel) => 
      this.isBBBContent(channel)
  };

  setChannels(channels: Channel[]) {
    this.channelsSubject.next(channels);
  }

  getFilteredContent(category: string): ContentGroup[] {
    const channels = this.channelsSubject.value;
    const filter = this.categoryFilters[category as keyof typeof this.categoryFilters];
    
    if (!filter) return [];

    const filteredChannels = channels.filter(filter);
    const grouped = this.groupChannels(filteredChannels, category);
    
    this.filteredContentSubject.next(grouped);
    return grouped;
  }

  private groupChannels(channels: Channel[], category: string): ContentGroup[] {
    if (category === 'movies' || category === 'series') {
      return this.groupByGenre(channels);
    }
    
    return [{
      name: this.getCategoryName(category),
      items: channels.slice(0, this.ITEMS_PER_PAGE),
      hasMore: channels.length > this.ITEMS_PER_PAGE,
      totalItems: channels.length
    }];
  }

  private groupByGenre(channels: Channel[]): ContentGroup[] {
    const groups = channels.reduce((acc, channel) => {
      const genre = this.getGenre(channel);
      if (!acc[genre]) {
        acc[genre] = {
          name: genre,
          items: [],
          hasMore: false,
          totalItems: 0
        };
      }
      
      acc[genre].totalItems++;
      if (acc[genre].items.length < this.ITEMS_PER_PAGE) {
        acc[genre].items.push(channel);
      }
      
      return acc;
    }, {} as Record<string, ContentGroup>);

    return Object.values(groups)
      .map(group => ({
        ...group,
        hasMore: group.totalItems > group.items.length
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private isSpecialContent(channel: Channel): boolean {
    return this.isSportsContent(channel) || this.isBBBContent(channel);
  }

  private isSportsContent(channel: Channel): boolean {
    const terms = ['espn', 'sportv', 'premiere', 'fight', 'esporte', 'sports'];
    return this.matchesTerms(channel, terms);
  }

  private isSeriesContent(channel: Channel): boolean {
    const terms = ['série', 'series', 'temporada', 'episodio'];
    return this.matchesTerms(channel, terms);
  }

  private isBBBContent(channel: Channel): boolean {
    const terms = ['bbb', 'big brother'];
    return this.matchesTerms(channel, terms);
  }

  private matchesTerms(channel: Channel, terms: string[]): boolean {
    const content = `${channel.name} ${channel.group}`.toLowerCase();
    return terms.some(term => content.includes(term));
  }

  private getGenre(channel: Channel): string {
    // Mapa de gêneros conhecido
    const genreMap: Record<string, string[]> = {
      'Ação': ['acao', 'action', 'aventura'],
      'Comédia': ['comedia', 'comedy'],
      'Drama': ['drama'],
      'Terror': ['terror', 'horror'],
      'Documentário': ['documentario', 'doc'],
      'Infantil': ['kids', 'infantil', 'animacao'],
      'Lançamentos': ['lancamento', 'newest']
    };

    const normalizedGroup = channel.group.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    for (const [genre, terms] of Object.entries(genreMap)) {
      if (terms.some(term => normalizedGroup.includes(term))) {
        return genre;
      }
    }

    return 'Outros';
  }

  private getCategoryName(category: string): string {
    const names: Record<string, string> = {
      live: 'TV Ao Vivo',
      sports: 'Esportes',
      movies: 'Filmes',
      series: 'Séries',
      bbb: 'BBB 25'
    };
    return names[category] || category;
  }

  loadMoreItems(groupName: string, category: string): Channel[] {
    const channels = this.channelsSubject.value;
    const filter = this.categoryFilters[category as keyof typeof this.categoryFilters];
    
    if (!filter) return [];

    const filteredChannels = channels.filter(filter);
    const groupChannels = filteredChannels.filter(channel => 
      this.getGroupName(channel) === groupName
    );

    const currentGroup = this.filteredContentSubject.value
      .find(g => g.name === groupName);

    if (!currentGroup) return [];

    const currentCount = currentGroup.items.length;
    const nextItems = groupChannels.slice(
      currentCount,
      currentCount + this.LOAD_MORE_COUNT
    );

    return nextItems;
  }

  private getGroupName(channel: Channel): string {
    if (channel.type === 'vod') {
      return this.getGenre(channel);
    }
    return channel.group || 'Outros';
  }
}