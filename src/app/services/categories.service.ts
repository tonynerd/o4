import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, shareReplay } from 'rxjs';

interface Category {
  id: number;
  group: string;
}

interface CategoriesResponse {
  categorias: Category[];
}

@Injectable({
  providedIn: 'root'
})
export class CategoriesService {
  private categories$ = this.http.get<CategoriesResponse>('assets/groups.json').pipe(
    map(response => response.categorias),
    shareReplay(1)
  );

  constructor(private http: HttpClient) {}

  getCategories(): Observable<Category[]> {
    return this.categories$;
  }

  getCategoryName(index: number): Observable<string> {
    return this.categories$.pipe(
      map(categories => {
        const category = categories.find(c => c.id === index + 1);
        return category ? `Filmes ${category.group}` : `Filmes ${index + 1}`;
      })
    );
  }
}