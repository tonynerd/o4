/// <reference lib="webworker" />

interface Channel {
  name: string;
  url: string;
  group: string;
  logo: string;
  type: string;
  isLive: boolean;
}

addEventListener('message', ({ data }) => {
  try {
    const { action, content, batchSize = 100 } = data;
    
    if (action === 'parseM3U') {
      const lines = content.split('\n');
      const totalLines = lines.length;
      let currentIndex = 0;
      
      while (currentIndex < totalLines) {
        const batch = lines.slice(currentIndex, currentIndex + batchSize);
        const channels = parseM3UBatch(batch);
        
        // Envia o lote processado
        postMessage({ 
          channels,
          progress: Math.min(100, (currentIndex / totalLines) * 100)
        });
        
        currentIndex += batchSize;
        
        // Pequena pausa para não travar o worker
        if (currentIndex < totalLines) {
          setTimeout(() => {}, 0);
        }
      }
      
      // Indica que terminou
      postMessage({ finished: true });
    }
  } catch (error) {
    postMessage({ error: error });
  }
});

function parseM3UBatch(lines: string[]): Channel[] {
  const channels: Channel[] = [];
  let currentChannel: Partial<Channel> = {};

  lines.forEach(line => {
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith('#EXTINF:')) {
      const groupMatch = trimmedLine.match(/group-title="([^"]*)"/);
      const logoMatch = trimmedLine.match(/tvg-logo="([^"]*)"/);
      const nameMatch = trimmedLine.match(/,(.*)$/);

      // Exemplo no channel.worker.ts
      currentChannel = {
        name: nameMatch ? nameMatch[1].trim() : 'Sem nome',
        group: groupMatch ? groupMatch[1].trim() : 'Outros',
        logo: logoMatch ? logoMatch[1] : 'assets/images/default-thumb.jpg',
        type: determineChannelType(groupMatch ? groupMatch[1] : ''),
        isLive: false
      };
    } else if (trimmedLine.startsWith('http')) {
      if (currentChannel.name) {
        channels.push({
          ...currentChannel,
          url: trimmedLine
        } as Channel);
        currentChannel = {};
      }
    }
  });

  return channels;
}

function determineChannelType(group: string): 'live' | 'vod' {
  const lowerGroup = group.toLowerCase();
  if (lowerGroup.includes('filmes') || lowerGroup.includes('series') || 
      lowerGroup.includes('séries')) {
    return 'vod';
  }
  return 'live';
}
