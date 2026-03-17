import 'dotenv/config';
import app from './app';

const PORT = process.env.PORT || 4000;

const startServer = () => {
  app.listen(PORT, () => {
    console.log(`🚀 Server ready at http://localhost:${PORT}`);
  });
};

startServer();
