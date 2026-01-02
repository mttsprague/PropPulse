import axios, { AxiosInstance } from 'axios';
import { auth } from './firebase';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.NEXT_PUBLIC_FUNCTIONS_BASE_URL || 'http://localhost:5001/api',
      timeout: 30000,
    });

    // Add auth token to requests
    this.client.interceptors.request.use(async (config) => {
      const user = auth.currentUser;
      if (user) {
        const token = await user.getIdToken();
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
  }

  async generatePropCard(data: any) {
    const response = await this.client.post('/prop-card', data);
    return response.data;
  }

  async searchPlayers(query: string) {
    const response = await this.client.get('/player/search', { params: { q: query } });
    return response.data;
  }

  async getPlayer(id: string) {
    const response = await this.client.get(`/player/${id}`);
    return response.data;
  }

  async getSavedProps(filters?: any) {
    const response = await this.client.get('/saved-props', { params: filters });
    return response.data;
  }

  async createSavedProp(data: any) {
    const response = await this.client.post('/saved-props', data);
    return response.data;
  }

  async updateSavedProp(id: string, data: any) {
    const response = await this.client.patch(`/saved-props/${id}`, data);
    return response.data;
  }

  async deleteSavedProp(id: string) {
    const response = await this.client.delete(`/saved-props/${id}`);
    return response.data;
  }

  async getDailyFeed(date?: string, watchlistOnly?: boolean) {
    const response = await this.client.get('/feed', {
      params: { date, watchlistOnly },
    });
    return response.data;
  }

  async exportPropCard(data: any) {
    const response = await this.client.post('/export/prop-card', data);
    return response.data;
  }

  async getWatchlist() {
    const response = await this.client.get('/watchlist');
    return response.data;
  }

  async addToWatchlist(data: any) {
    const response = await this.client.post('/watchlist', data);
    return response.data;
  }

  async removeFromWatchlist(id: string) {
    const response = await this.client.delete(`/watchlist/${id}`);
    return response.data;
  }
}

export const apiClient = new ApiClient();
