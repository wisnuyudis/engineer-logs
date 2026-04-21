import 'dotenv/config';
import app from './app';
import { startBot } from './bot/telegramBot';

const PORT = process.env.PORT || 4000;

const startServer = () => {
  app.listen(PORT, () => {
    console.log(`🚀 Server ready at http://localhost:${PORT}`);
    startBot();
  });
};

startServer();
