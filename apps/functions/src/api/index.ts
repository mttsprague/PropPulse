import { Router, type Router as RouterType } from 'express';
import { propCardRouter } from './routes/prop-card';
import { playerRouter } from './routes/player';
import { savedPropsRouter } from './routes/saved-props';
import { dailyFeedRouter } from './routes/daily-feed';
import { exportRouter } from './routes/export';
import { watchlistRouter } from './routes/watchlist';

export const apiRouter: RouterType = Router();

apiRouter.use('/prop-card', propCardRouter);
apiRouter.use('/player', playerRouter);
apiRouter.use('/saved-props', savedPropsRouter);
apiRouter.use('/feed', dailyFeedRouter);
apiRouter.use('/export', exportRouter);
apiRouter.use('/watchlist', watchlistRouter);

apiRouter.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
