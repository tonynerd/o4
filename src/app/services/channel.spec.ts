import { Component, OnInit } from '@angular/core';
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ChannelService {
  constructor() { }

  async loadChannels(): Promise<string> {
    // Implement your channel loading logic here
    return 'Channel data';
  }
}

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss']
})
export class HomePage {
  channelsData: string = '';

  constructor(private channelService: ChannelService) {}

  async ngOnInit() {
    try {
      this.channelsData = await this.channelService.loadChannels();
      console.log('Dados recebidos:', this.channelsData);
    } catch (error) {
      console.error('Erro no componente:', error);
    }
  }
}