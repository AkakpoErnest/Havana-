import { createApp } from './app';
async function main() {
  const app=await createApp();
  await app.listen(Number(process.env.PORT??3000),'0.0.0.0');
}
void main();
