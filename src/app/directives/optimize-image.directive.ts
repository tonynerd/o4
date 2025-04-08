import { Directive, ElementRef, Input, OnInit } from '@angular/core';

@Directive({
  selector: 'img[optimizeImage]', // Alterado para usar em elementos img
  standalone: true
})
export class OptimizeImageDirective implements OnInit {
  @Input() imageUrl!: string;
  private retryCount = 0;
  private maxRetries = 2;
  private retryDelay = 2000;

  constructor(private el: ElementRef<HTMLImageElement>) {}

  ngOnInit() {
    this.loadImage();
  }

  private loadImage() {
    const img = this.el.nativeElement;
    
    img.onload = () => {
      this.retryCount = 0;
    };

    img.onerror = () => {
      if (this.retryCount < this.maxRetries) {
        setTimeout(() => {
          this.retryCount++;
          img.src = this.imageUrl;
        }, this.retryDelay * this.retryCount);
      }
    };

    img.src = this.imageUrl;
  }
}
