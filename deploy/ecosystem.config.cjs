// Configuração do PM2 (process manager do Node) para rodar o site na VPS.
// Subida: pm2 start deploy/ecosystem.config.cjs
// Recarregamento sem cair: pm2 reload evenon
const APP_DIR = process.env.APP_DIR || "/www/wwwroot/evenon.com.br";

module.exports = {
  apps: [
    {
      name: "evenon",
      cwd: APP_DIR,
      script: ".output/server/index.mjs",
      instances: 1,
      exec_mode: "fork",
      // Para dividir entre vários núcleos, troque as duas linhas acima por:
      //   instances: "max",
      //   exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        NITRO_HOST: "127.0.0.1",
        PORT: "3000",
        NITRO_PORT: "3000",
      },
      max_memory_restart: "1G",
      out_file: `${APP_DIR}/logs/pm2-out.log`,
      error_file: `${APP_DIR}/logs/pm2-error.log`,
      time: true,
    },
  ],
};
