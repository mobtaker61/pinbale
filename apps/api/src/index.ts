import { getConfig } from '@pinbale/config';
import { createApp } from './app.js';

async function bootstrap() {
  const config = getConfig();
  const app = await createApp();
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
