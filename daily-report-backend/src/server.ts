import 'dotenv/config';
import app from './app';
import { startBot } from './bot/telegramBot';
import { startJiraWorklogPoller } from './services/jiraWorklogPoller';

const PORT = process.env.PORT || 4000;

const startServer = () => {
  app.listen(PORT, () => {
    console.log(`🚀 Server ready at http://localhost:${PORT}`);
    startBot();
    startJiraWorklogPoller();
  });
};

startServer();
